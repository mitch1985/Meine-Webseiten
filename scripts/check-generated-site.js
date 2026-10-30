const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("parse5");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist");
const pathPrefix = new URL(process.env.ELEVENTY_PATH_PREFIX || "/", "https://local.test").pathname;
const archive = require(path.join(root, "site", "_data", "archive.json"));
const htmlFiles = [];
const cssFiles = [];
const problems = [];
let emptyAltImages = 0;

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(filePath);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".html")) htmlFiles.push(filePath);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".css")) cssFiles.push(filePath);
  }
}

function textContent(node) {
  if (node.nodeName === "#text") return node.value;
  return (node.childNodes ?? []).map(textContent).join("");
}

function visit(node, callback) {
  if (node.tagName) callback(node);
  for (const child of node.childNodes ?? []) visit(child, callback);
}

function hasClass(node, className) {
  if (!node) return false;
  return (node.attrs?.find((attribute) => attribute.name === "class")?.value || "")
    .split(/\s+/)
    .includes(className);
}

function contains(node, predicate) {
  let found = false;
  visit(node, (candidate) => {
    if (predicate(candidate)) found = true;
  });
  return found;
}

function localTarget(value, fromFile) {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|data:)/i.test(value)) return null;

  let pathname;
  try {
    const relativePage = path.relative(output, fromFile).split(path.sep).join("/");
    pathname = decodeURIComponent(new URL(value, `https://local.test/${relativePage}`).pathname);
  } catch {
    problems.push(`Invalid local URL: ${value}`);
    return null;
  }

  if (pathPrefix !== "/" && pathname.startsWith(pathPrefix)) {
    pathname = `/${pathname.slice(pathPrefix.length)}`;
  }

  const target = path.resolve(output, `.${pathname}`);
  if (target !== output && !target.startsWith(`${output}${path.sep}`)) {
    problems.push(`Path escapes the generated output: ${value}`);
    return null;
  }
  if (fs.existsSync(target) && fs.statSync(target).isFile()) return target;
  if (fs.existsSync(path.join(target, "index.html"))) return path.join(target, "index.html");
  if (!path.extname(target) && fs.existsSync(`${target}.html`)) return `${target}.html`;
  return target;
}

if (!fs.existsSync(output)) throw new Error("Generated site not found. Run npm run build first.");
walk(output);

if (archive.news.length < 50 || archive.events.length < 50) {
  problems.push(`Imported too few articles: ${archive.news.length} news and ${archive.events.length} events.`);
}

for (const page of archive.pages) {
  if (!fs.existsSync(path.join(output, page.outputPath))) {
    problems.push(`Missing imported page: ${page.outputPath}`);
  }
}

for (const filePath of htmlFiles) {
  const document = parse(fs.readFileSync(filePath, "utf8"));
  const ids = new Set();
  const references = [];
  const headings = [];
  const headingText = [];
  const addresses = [];
  const themeOptions = [];
  let equipmentLogoCount = 0;
  let title = "";
  const relativePath = path.relative(output, filePath);

  visit(document, (node) => {
    if (node.tagName === "title") title = textContent(node).trim();
    if (node.tagName === "h1") headings.push(node);
    if (/^h[1-6]$/.test(node.tagName)) {
      const heading = textContent(node).replace(/\s+/g, " ").trim();
      headingText.push(heading);
      if (!heading) problems.push(`Empty heading in ${relativePath}`);
    }
    if (node.tagName === "address") addresses.push(node);
    if (
      node.tagName === "option"
      && node.parentNode?.tagName === "select"
      && node.parentNode.attrs?.some((attribute) => attribute.name === "id" && attribute.value === "theme-select")
    ) {
      themeOptions.push(node.attrs?.find((attribute) => attribute.name === "value")?.value);
    }
    if (node.tagName === "img") {
      const alt = node.attrs?.find((attribute) => attribute.name === "alt");
      if (!alt) problems.push(`Image is missing an alt attribute in ${relativePath}`);
      else if (!alt.value.trim()) emptyAltImages += 1;
      if (node.attrs?.some((attribute) =>
        attribute.name === "src"
        && attribute.value.endsWith("/csm_logoguenthers_ef691f1468.png")
      )) equipmentLogoCount += 1;
    }

    for (const attribute of node.attrs ?? []) {
      if (attribute.name === "id") ids.add(attribute.value);
      if (attribute.name === "href" && attribute.value.startsWith("#")) {
        references.push({ type: "fragment", value: attribute.value.slice(1) });
      }
      if (["href", "src", "poster"].includes(attribute.name) && !attribute.value.startsWith("#")) {
        references.push({ type: "url", value: attribute.value, tag: node.tagName });
        if (
          pathPrefix !== "/"
          && attribute.value.startsWith("/")
          && !attribute.value.startsWith(pathPrefix)
        ) {
          problems.push(`Missing deployment path prefix in local URL ${attribute.value} in ${relativePath}`);
        }
      }
      if (attribute.name === "srcset" && pathPrefix !== "/") {
        for (const candidate of attribute.value.split(",")) {
          const value = candidate.trim().split(/\s+/, 1)[0];
          if (value.startsWith("/") && !value.startsWith(pathPrefix)) {
            problems.push(`Missing deployment path prefix in srcset URL ${value} in ${relativePath}`);
          }
        }
      }
    }
  });

  if (!title) problems.push(`Missing document title: ${relativePath}`);
  if (headings.length !== 1) problems.push(`Expected one h1 in ${relativePath}, found ${headings.length}.`);
  if (
    relativePath === "index.html"
    && !["club", "halloween", "autumn", "floodlight", "fancy"].every((theme) => themeOptions.includes(theme))
  ) {
    problems.push("Theme selector is missing one or more site themes.");
  }
  if (!fs.readFileSync(filePath, "utf8").includes("© 2026")) {
    problems.push(`Missing current club copyright in ${relativePath}`);
  }

  for (const address of addresses) {
    if (!contains(address, (node) => node.tagName === "p" && hasClass(node, "address-address"))) continue;

    const hasMapsLink = contains(address, (node) =>
      node.tagName === "a" && node.attrs?.some(
        (attribute) => attribute.name === "href" && attribute.value.startsWith("https://www.google.com/maps/")
      )
    );
    const siblings = address.parentNode?.childNodes ?? [];
    const addressIndex = siblings.indexOf(address);
    const nextElement = siblings.slice(addressIndex + 1).find((node) => node.tagName);
    const hasMapsEmbed = hasClass(nextElement, "map-embed") && contains(nextElement, (node) =>
      node.tagName === "iframe" && node.attrs?.some(
        (attribute) => attribute.name === "src" && attribute.value.startsWith("https://www.google.com/maps?q=")
      )
    );
    if (!hasMapsLink || !hasMapsEmbed) {
      problems.push(`Address is missing its Google Maps link or embed in ${relativePath}`);
    }
  }

  if (relativePath === path.join("verein", "kontakt-1", "index.html")) {
    if (headingText.some((text) => !text)) {
      problems.push(`Contact page contains an empty heading in ${relativePath}`);
    }
    const contactCard = addresses.find((address) => hasClass(address, "contact-card"));
    if (!contactCard) {
      problems.push(`Contact page is missing its formatted contact card in ${relativePath}`);
    } else {
      const expectedFields = ["address-title", "address-address", "address-fax", "address-map-link"];
      const contactFields = contactCard.childNodes.filter((node) => node.tagName === "p");
      if (contactFields.length !== expectedFields.length || expectedFields.some((className) =>
        !contactFields.some((field) => hasClass(field, className))
      )) {
        problems.push(`Contact page has unexpected contact-card content in ${relativePath}`);
      }
    }
    if (!fs.readFileSync(filePath, "utf8").includes("Schulstraße 9")) {
      problems.push(`Contact page is missing the corrected street address in ${relativePath}`);
    }
    if (fs.readFileSync(filePath, "utf8").includes("bzw. 11")) {
      problems.push(`Contact page still includes the removed alternate street number in ${relativePath}`);
    }
  }

  if (relativePath === path.join("verein", "ausruestung", "index.html") && equipmentLogoCount !== 1) {
    problems.push(`Expected exactly one Günther's Sport-Shop logo in ${relativePath}, found ${equipmentLogoCount}.`);
  }

  for (const reference of references) {
    if (reference.type === "fragment") {
      if (reference.value && !ids.has(reference.value)) {
        problems.push(`Broken fragment #${reference.value} in ${relativePath}`);
      }
      continue;
    }

    const target = localTarget(reference.value, filePath);
    if (target && !fs.existsSync(target)) {
      problems.push(`Broken local ${reference.tag} URL ${reference.value} in ${relativePath}`);
    }
  }
}

for (const filePath of cssFiles) {
  const contents = fs.readFileSync(filePath, "utf8");
  const urls = contents.matchAll(/url\(\s*(?:"([^"]+)"|'([^']+)'|([^)]*))\s*\)/g);
  for (const match of urls) {
    const value = (match[1] ?? match[2] ?? match[3]).trim();
    const target = localTarget(value, filePath);
    if (target && !fs.existsSync(target)) {
      problems.push(`Broken local CSS URL ${value} in ${path.relative(output, filePath)}`);
    }
  }
}

if (problems.length) {
  console.error(`Generated-site checks failed with ${problems.length} issue(s):`);
  for (const problem of problems.slice(0, 40)) console.error(`- ${problem}`);
  if (problems.length > 40) console.error(`- ...and ${problems.length - 40} more.`);
  process.exitCode = 1;
} else {
  console.log(
    `Validated ${htmlFiles.length} HTML files, ${archive.news.length} news, ` +
    `${archive.events.length} events and ${archive.pages.length - archive.articles.length} other pages.`
  );
  if (emptyAltImages) {
    console.warn(`${emptyAltImages} images have empty alt text; review whether any need descriptive alternatives.`);
  }
}
