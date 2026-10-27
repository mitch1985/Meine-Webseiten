const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parse, parseFragment, serialize } = require("parse5");

const root = path.resolve(__dirname, "..");
const archiveRoot = path.join(root, "sv-hagenbuechach.de", "sv-hagenbuechach.de");
const generatedOutput = path.join(root, "dist");
const generatedData = path.join(root, "site", "_data", "archive.json");
const generatedAssets = path.join(root, "site", "assets", "archive");
const ignoredDirectories = new Set(["_processed_", "_temp_", "typo3temp"]);
const utilityPages = new Set([
  "fitness/manifest.json.html",
  "fussball/jugend/manifest.json.html",
  "gtm.html",
  "manifest.json.html",
  "offline.html",
  "plugins/index.html",
  "rechtliches/manifest.json.html",
  "tischtennis/manifest.json.html",
  "verein/manifest.json.html",
  "Popover requires tooltip.html"
]);
const sourceFiles = [];
const copiedAssets = new Set();
const unresolvedAssets = new Set();

if (!fs.existsSync(archiveRoot)) {
  throw new Error(`HTTrack source archive not found: ${archiveRoot}`);
}

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) walk(fullPath);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".html")) {
      sourceFiles.push(fullPath);
    }
  }
}

function visit(node, callback) {
  callback(node);
  for (const child of node.childNodes ?? []) visit(child, callback);
  if (node.content) visit(node.content, callback);
}

function findElements(node, predicate) {
  const found = [];
  visit(node, (candidate) => {
    if (candidate.tagName && predicate(candidate)) found.push(candidate);
  });
  return found;
}

function getAttribute(node, name) {
  return node.attrs?.find((attribute) => attribute.name === name)?.value;
}

function setAttribute(node, name, value) {
  node.attrs ??= [];
  const attribute = node.attrs.find((candidate) => candidate.name === name);
  if (attribute) attribute.value = value;
  else node.attrs.push({ name, value });
}

function removeAttribute(node, name) {
  if (node.attrs) node.attrs = node.attrs.filter((attribute) => attribute.name !== name);
}

function textContent(node) {
  if (node.nodeName === "#text") return node.value;
  return (node.childNodes ?? []).map(textContent).join("");
}

function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[äÄ]/g, "ae")
    .replace(/[öÖ]/g, "oe")
    .replace(/[üÜ]/g, "ue")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function relativeSourcePath(filePath) {
  return path.relative(archiveRoot, filePath).split(path.sep).join("/");
}

function articleKind(sourcePath) {
  if (sourcePath.startsWith("verein/events/")) return "event";
  if (sourcePath.startsWith("verein/beitraege/")) return "news";
  return null;
}

function isArticlePath(sourcePath) {
  return /^(verein\/events|verein\/beitraege)\/details[^/]*\.html$/i.test(sourcePath);
}

function isListPath(sourcePath) {
  return /^verein\/(?:events|news)[0-9a-f]*\.html$/i.test(sourcePath);
}

function staticRoute(sourcePath) {
  const withoutExtension = sourcePath.replace(/\.html$/i, "");
  const parts = withoutExtension.split("/");

  if (sourcePath === "index.html") return "/";
  if (parts[0] === "rechtliches") return `/${parts.join("/")}/`;
  if (parts[0] === "verein") return `/${parts.join("/")}/`;
  if (parts[0] === "fussball" || parts[0] === "tischtennis") {
    return `/sport/${parts.join("/")}/`;
  }
  if (parts.length === 1 && parts[0] === "datenschutzerklaerung") {
    return "/rechtliches/datenschutz/";
  }
  if (parts.length === 1 && parts[0] === "haftungsausschluss") {
    return "/rechtliches/haftungsausschluss/";
  }
  if (parts.length === 1 && parts[0] === "fitness") return "/sport/fitness/";
  if (parts.length === 1 && parts[0] === "gymnastik") return "/sport/gymnastik/";
  if (parts.length === 1) return `/sport/${parts[0]}/`;
  return `/${parts.join("/")}/`;
}

function articleRoute(kind, title, sourcePath, usedRoutes) {
  const folder = kind === "event" ? "veranstaltungen" : "nachrichten";
  const fileKey = path.basename(sourcePath, ".html").replace(/^details/i, "");
  const baseSlug = slugify(title) || `beitrag-${fileKey}`;
  let candidate = baseSlug;

  if (usedRoutes.has(candidate)) candidate = `${baseSlug}-${fileKey.toLowerCase() || "alt"}`;
  let suffix = 2;
  while (usedRoutes.has(candidate)) candidate = `${baseSlug}-${suffix++}`;
  usedRoutes.add(candidate);
  return `/verein/${folder}/${candidate}/`;
}

function pageTitle(document, main) {
  const titleNode = findElements(document, (node) => node.tagName === "title")[0];
  const rawTitle = titleNode ? textContent(titleNode).trim() : "";
  const suffix = " - Sportverein Hagenbüchach 1979 e.V.";
  const title = rawTitle.endsWith(suffix) ? rawTitle.slice(0, -suffix.length).trim() : rawTitle;
  if (title && !/^page not found/i.test(title)) return title;

  const heading = findElements(main, (node) => node.tagName === "h1")[0];
  return heading ? textContent(heading).trim() : "";
}

function findContentRoot(document) {
  return findElements(document, (node) => node.tagName === "main")[0]
    ?? findElements(document, (node) => node.attrs?.some(
      (attribute) => attribute.name === "id" && attribute.value === "page-content"
    ))[0]
    ?? null;
}

function pageDate(main, document) {
  const time = findElements(main, (node) => node.tagName === "time")
    .find((node) => getAttribute(node, "datetime"));
  if (time) return getAttribute(time, "datetime");

  const dateMeta = findElements(document, (node) => node.tagName === "meta")
    .find((node) => ["article:published_time", "date", "datepublished"].includes(
      (getAttribute(node, "property") || getAttribute(node, "name") || "").toLowerCase()
    ));
  return dateMeta ? getAttribute(dateMeta, "content") || "" : "";
}

function routeKey(value) {
  return value
    .replaceAll("\\", "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .replace(/\.html$/i, "")
    .toLowerCase();
}

function sourcePathFromUrl(sourcePath, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const resolved = decoded.startsWith("/")
    ? path.resolve(archiveRoot, `.${decoded}`)
    : path.resolve(archiveRoot, path.dirname(sourcePath), decoded);
  const relative = path.relative(archiveRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return relative.split(path.sep).join("/");
}

function findExistingAsset(sourceRelativePath) {
  if (!sourceRelativePath) return null;
  const candidates = [
    path.join(archiveRoot, sourceRelativePath),
    path.join(archiveRoot, `${sourceRelativePath}.html`),
    path.join(archiveRoot, sourceRelativePath, "index.html")
  ];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? null;
}

function copyAsset(sourceRelativePath) {
  const source = findExistingAsset(sourceRelativePath);
  if (!source) {
    unresolvedAssets.add(sourceRelativePath);
    return null;
  }
  if (path.extname(source).toLowerCase() === ".html") return null;

  const assetPath = relativeSourcePath(source);
  const target = path.join(generatedAssets, assetPath);
  if (!copiedAssets.has(assetPath)) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    copiedAssets.add(assetPath);
  }
  return `/assets/archive/${assetPath.split("/").map(encodeURIComponent).join("/")}`;
}

function extractSponsorLogos(content) {
  const fragment = parseFragment(content);
  const sponsors = [];

  function collectImages(node, images) {
    if (node.tagName === "img") images.push(node);
    for (const child of node.childNodes ?? []) collectImages(child, images);
  }

  function textContent(node) {
    if (node.nodeName === "#text") return node.value;
    return (node.childNodes ?? []).map(textContent).join(" ").replace(/\s+/g, " ").trim();
  }

  function visit(node) {
    if (node.tagName === "a") {
      const attributes = Object.fromEntries((node.attrs ?? []).map(({ name, value }) => [name, value]));
      const images = [];
      collectImages(node, images);
      if (attributes.href && images.length) {
        const imageAttributes = Object.fromEntries((images[0].attrs ?? []).map(({ name, value }) => [name, value]));
        const name = attributes.title || imageAttributes.alt || textContent(node);
        if (name && imageAttributes.src) {
          sponsors.push({ name, href: attributes.href, image: imageAttributes.src });
        }
      }
    }

    for (const child of node.childNodes ?? []) visit(child);
  }

  visit(fragment);
  return sponsors;
}

function updateTableTennisTraining(page) {
  const fragment = parseFragment(page.content);
  let replacementCount = 0;

  function visit(parent) {
    const children = parent.childNodes ?? [];
    for (let index = 0; index < children.length; index += 1) {
      const node = children[index];
      if (node.tagName === "h4" && textContent(node).replace(/\s+/g, " ").trim() === "Training:") {
        const previous = children[index - 1];
        const start = previous?.tagName === "h4"
          && textContent(previous).replace(/[\s\u00a0]+/g, "").length === 0
          ? index - 1
          : index;
        let end = index;
        let elementCount = 0;
        while (end < children.length && elementCount < 3) {
          if (children[end].tagName) elementCount += 1;
          end += 1;
        }
        if (elementCount !== 3) {
          throw new Error("Could not locate the full table tennis training and address section.");
        }

        const replacement = parseFragment(
          '<h4>Trainingszeiten</h4>' +
          '<div class="well"><h5>Herren</h5>' +
          '<p>Montag: 19:00–22:30 Uhr</p>' +
          '<p>Dienstag und Donnerstag: abhängig von Heimspielen, jeweils 19:00–22:30 Uhr</p></div>' +
          '<div class="well"><h5>Kindertraining</h5>' +
          '<p>Donnerstag: 18:00–19:00 Uhr in Hagenbüchach</p>' +
          '<p>Dienstag: ab 17:30 Uhr in Wilhelmsdorf (Spielgemeinschaft)</p></div>' +
          '<h4>Trainingsort</h4>' +
          '<div class="well"><p>Turnhalle / Feuerwehrhaus</p>' +
          '<p>Schulstraße 15</p><p>91469 Hagenbüchach</p>' +
          '<p><a href="https://www.google.com/maps/search/?api=1&amp;query=Schulstra%C3%9Fe%2015%2C%2091469%20Hagenb%C3%BCchach" target="_blank" rel="noopener noreferrer">Adresse in Google Maps öffnen</a></p></div>' +
          '<div class="map-embed"><iframe src="https://www.google.com/maps?q=Schulstra%C3%9Fe%2015%2C%2091469%20Hagenb%C3%BCchach&amp;output=embed" title="Karte: Turnhalle / Feuerwehrhaus, Schulstraße 15, 91469 Hagenbüchach" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe></div>'
        );
        children.splice(start, end - start, ...replacement.childNodes);
        for (const child of replacement.childNodes) child.parentNode = parent;
        replacementCount += 1;
        return;
      }

      visit(node);
      if (replacementCount) return;
    }
  }

  visit(fragment);
  if (replacementCount !== 1) {
    throw new Error(`Expected one table tennis training section, found ${replacementCount}.`);
  }
  page.content = fragment.childNodes.map(serialize).join("");
}

function updateTableTennisRosters(pages) {
  const teams = [
    {
      source: "tischtennis/herren.html",
      players: ["Michael Kruse", "Waldemar Steiger", "Bodo Kämpfer", "Peter Schramm", "Carsten Sprenger"]
    },
    {
      source: "tischtennis/herren-2.html",
      players: ["Peter Schramm", "Paul Schramm", "Florian Käßmann", "Jochen Schramm"]
    },
    {
      source: "tischtennis/herren-3.html",
      players: ["Jochen Schramm", "Aurel Cismaru", "Felix Maatz", "Andreas Schramm", "Andreas Maatz", "Christian During"]
    },
    {
      source: "tischtennis/herren-4.html",
      players: ["Andreas Maatz", "Ingo Friedrich", "Christian During", "Adrian Leibold", "Katja Rothmann-Adam", "Michael Martinkovich"]
    }
  ];
  const sourceUrl = "https://www.mytischtennis.de/click-tt/ByTTV/26--27/verein/104041/SV_Hagenb%C3%BCchach/bilanzen/gesamt";

  function makeRoster(players) {
    const list = {
      nodeName: "ul",
      tagName: "ul",
      attrs: [{ name: "class", value: "team-roster" }],
      namespaceURI: "http://www.w3.org/1999/xhtml",
      childNodes: [],
      parentNode: null
    };

    for (const player of players) {
      const item = parseFragment(`<li>${player}</li>`).childNodes[0];
      item.parentNode = list;
      list.childNodes.push(item);
    }
    return list;
  }

  for (const team of teams) {
    const page = pages.find((candidate) => candidate.source === team.source);
    if (!page) throw new Error(`Could not find table tennis team page: ${team.source}`);

    const fragment = parseFragment(page.content);
    let headingCount = 0;
    let rosterCount = 0;

    function replaceRoster(parent) {
      const children = parent.childNodes ?? [];
      for (let index = 0; index < children.length; index += 1) {
        const node = children[index];
        if (["h2", "h3", "h4", "h5"].includes(node.tagName)
          && textContent(node).replace(/\s+/g, " ").trim().startsWith("Mannschaftsmeldung")) {
          node.childNodes = [{ nodeName: "#text", value: "Bisherige Einsätze – Saison 2026/27", parentNode: node }];
          headingCount += 1;
          continue;
        }

        if (node.tagName === "ol") {
          const hasPlayers = (node.childNodes ?? [])
            .some((child) => child.tagName === "li" && textContent(child).trim());
          if (hasPlayers && rosterCount === 0) {
            const list = makeRoster(team.players);
            list.parentNode = parent;
            children[index] = list;
            rosterCount += 1;
          } else if (!hasPlayers) {
            children.splice(index, 1);
            index -= 1;
          }
          continue;
        }

        if (node.tagName === "p" && textContent(node).replace(/\s+/g, " ").trim() === "4.1 Andy Maatz") {
          const list = makeRoster(team.players);
          list.parentNode = parent;
          children[index] = list;
          rosterCount += 1;
          continue;
        }

        replaceRoster(node);
      }
    }

    replaceRoster(fragment);
    if (headingCount !== 1 || rosterCount !== 1) {
      throw new Error(
        `Expected one roster heading and list on ${team.source}; found ${headingCount} heading(s) and ${rosterCount} list(s).`
      );
    }

    const attribution = parseFragment(
      `<p class="roster-source">Zwischenstand mit bisherigen Einsätzen (Stand: 27.10.2026). ` +
      `<a href="${sourceUrl}" target="_blank" rel="noopener noreferrer">Quelle: myTischtennis-Spielerbilanzen 2026/27</a>. ` +
      "Keine vollständige Mannschaftsmeldung.</p>"
    ).childNodes[0];

    const roster = (() => {
      let found = null;
      function findList(node) {
        if (node.tagName === "ul" && (node.attrs ?? []).some((attribute) => attribute.name === "class" && attribute.value === "team-roster")) {
          found = node;
          return;
        }
        for (const child of node.childNodes ?? []) {
          if (!found) findList(child);
        }
      }
      findList(fragment);
      return found;
    })();

    attribution.parentNode = roster.parentNode;
    const rosterIndex = roster.parentNode.childNodes.indexOf(roster);
    roster.parentNode.childNodes.splice(rosterIndex + 1, 0, attribution);
    page.content = fragment.childNodes.map(serialize).join("");
  }
}

function resolvePageLink(sourcePath, urlPath, routeBySource) {
  const targetSource = sourcePathFromUrl(sourcePath, urlPath);
  if (!targetSource) return null;

  const exact = routeBySource.get(routeKey(targetSource));
  if (exact) return exact;

  const extensionless = routeBySource.get(routeKey(targetSource.replace(/\.html$/i, "")));
  if (extensionless) return extensionless;

  if (path.extname(targetSource) === "") {
    return routeBySource.get(routeKey(`${targetSource}.html`)) ?? null;
  }
  return null;
}

function rewriteUrl(value, sourcePath, routeBySource, isAsset) {
  if (!value || value.startsWith("#")) {
    return value === "#top" ? "#start" : value;
  }

  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value)) {
    let url;
    try {
      url = new URL(value, "https://sv-hagenbuechach.de");
    } catch {
      return value;
    }

    if (!["sv-hagenbuechach.de", "www.sv-hagenbuechach.de"].includes(url.hostname)) return value;
    if (!isAsset) {
      const pageRoute = resolvePageLink(sourcePath, url.pathname, routeBySource);
      if (pageRoute) return `${pageRoute}${url.hash}`;
    }

    const sourceAssetPath = sourcePathFromUrl(sourcePath, url.pathname);
    const existingSource = findExistingAsset(sourceAssetPath);
    if (existingSource && path.extname(existingSource).toLowerCase() === ".html") return null;
    const copiedPath = copyAsset(sourceAssetPath);
    return copiedPath ? `${copiedPath}${url.search}${url.hash}` : value;
  }

  const hashIndex = value.indexOf("#");
  const queryIndex = value.indexOf("?");
  const pathEnd = [hashIndex, queryIndex].filter((index) => index >= 0).sort((a, b) => a - b)[0];
  const urlPath = pathEnd === undefined ? value : value.slice(0, pathEnd);
  const suffix = pathEnd === undefined ? "" : value.slice(pathEnd);
  if (!urlPath) return value;

  if (!isAsset) {
    const pageRoute = resolvePageLink(sourcePath, urlPath, routeBySource);
    if (pageRoute) return `${pageRoute}${suffix.startsWith("#") ? suffix : ""}`;
  }

  const sourceAssetPath = sourcePathFromUrl(sourcePath, urlPath);
  const existingSource = findExistingAsset(sourceAssetPath);
  if (existingSource && path.extname(existingSource).toLowerCase() === ".html") return null;
  const copiedPath = copyAsset(sourceAssetPath);
  if (copiedPath) return `${copiedPath}${suffix}`;

  return value;
}

function rewriteSrcset(value, sourcePath, routeBySource) {
  return value
    .split(",")
    .map((candidate) => {
      const [url, ...descriptor] = candidate.trim().split(/\s+/);
      if (!url) return "";
      return [rewriteUrl(url, sourcePath, routeBySource, true), ...descriptor].join(" ");
    })
    .filter(Boolean)
    .join(", ");
}

function cleanNode(node, sourcePath, routeBySource) {
  if (node.tagName && ["script", "style", "iframe", "object", "embed", "nav"].includes(node.tagName)) {
    return null;
  }

  if (node.tagName === "img" && getAttribute(node, "src")?.startsWith("data:")) {
    const lazySource = getAttribute(node, "data-cbp-src")
      || getAttribute(node, "data-src")
      || getAttribute(node, "data-lazy-src");
    if (lazySource) setAttribute(node, "src", lazySource);
  }
  if (node.tagName === "img") {
    if (getAttribute(node, "alt") === undefined) setAttribute(node, "alt", "");
    if (!getAttribute(node, "loading")) setAttribute(node, "loading", "lazy");
    if (!getAttribute(node, "decoding")) setAttribute(node, "decoding", "async");
  }

  if (node.attrs) {
    for (const attribute of [...node.attrs]) {
      if (
        attribute.name === "style"
        || attribute.name.startsWith("on")
        || ["data-cbp-src", "data-src", "data-lazy-src", "data-srcset"].includes(attribute.name)
      ) {
        removeAttribute(node, attribute.name);
      } else if (attribute.name === "href") {
        const href = rewriteUrl(attribute.value, sourcePath, routeBySource, false);
        if (href === null) removeAttribute(node, "href");
        else setAttribute(node, "href", href);
      } else if (["src", "poster"].includes(attribute.name)) {
        const source = rewriteUrl(attribute.value, sourcePath, routeBySource, true);
        if (source === null) removeAttribute(node, attribute.name);
        else setAttribute(node, attribute.name, source);
      } else if (attribute.name === "srcset") {
        setAttribute(node, "srcset", rewriteSrcset(attribute.value, sourcePath, routeBySource));
      }
    }

    if (getAttribute(node, "target") === "_blank") {
      const rel = new Set((getAttribute(node, "rel") || "").split(/\s+/).filter(Boolean));
      rel.add("noopener");
      setAttribute(node, "rel", [...rel].join(" "));
    }
  }

  if (node.childNodes) {
    node.childNodes = node.childNodes
      .map((child) => cleanNode(child, sourcePath, routeBySource))
      .filter(Boolean);
    for (const child of node.childNodes) child.parentNode = node;
  }
  return node;
}

function cleanMain(main, sourcePath, routeBySource) {
  const children = main.childNodes
    .map((child) => cleanNode(child, sourcePath, routeBySource))
    .filter(Boolean);
  for (const child of children) child.parentNode = main;
  main.childNodes = children;
  return children.map(serialize).join("");
}

function summaryFor(main, title) {
  const paragraph = findElements(main, (node) => node.tagName === "p")
    .map((node) => textContent(node).replace(/\s+/g, " ").trim())
    .find((text) => text.length > 35);
  return paragraph || `${title} – Informationen des Sportvereins Hagenbüchach.`;
}

function sectionFor(sourcePath) {
  if (sourcePath.startsWith("verein/")) return "verein";
  if (sourcePath.startsWith("rechtliches/") || /^(datenschutzerklaerung|haftungsausschluss)\.html$/i.test(sourcePath)) {
    return "rechtliches";
  }
  if (sourcePath.startsWith("fussball/")) return "fussball";
  if (sourcePath.startsWith("tischtennis/")) return "tischtennis";
  return "sport";
}

function createPageRecord(filePath, routeBySource) {
  const sourcePath = relativeSourcePath(filePath);
  const document = parse(fs.readFileSync(filePath, "utf8"));
  const main = findContentRoot(document);
  if (!main) return null;

  const title = pageTitle(document, main);
  if (!title) return null;
  const kind = articleKind(sourcePath);
  const route = routeBySource.get(routeKey(sourcePath));
  const sourceHeading = findElements(main, (node) => node.tagName === "h1")[0];
  if (sourceHeading) setAttribute(sourceHeading, "id", "archive-page-title");
  const image = findElements(main, (node) => node.tagName === "img")
    .map((node) => {
      const source = getAttribute(node, "src");
      if (source?.startsWith("data:")) {
        return getAttribute(node, "data-cbp-src")
          || getAttribute(node, "data-src")
          || getAttribute(node, "data-lazy-src")
          || source;
      }
      return source;
    })
    .find(Boolean);
  const content = cleanMain(main, sourcePath, routeBySource);
  if (!content.trim()) return null;

  const headings = findElements(main, (node) => node.tagName === "h1");
  const date = pageDate(main, document);

  return {
    title,
    route,
    outputPath: `${route.replace(/^\/+/, "")}index.html`,
    source: sourcePath,
    section: sectionFor(sourcePath),
    kind: kind || "page",
    date,
    summary: summaryFor(main, title),
    image: image ? rewriteUrl(image, sourcePath, routeBySource, true) : "",
    hasHeading: headings.length > 0,
    content
  };
}

function articleSourceInfo(filePath, usedRoutes) {
  const sourcePath = relativeSourcePath(filePath);
  const document = parse(fs.readFileSync(filePath, "utf8"));
  const main = findContentRoot(document);
  if (!main) return null;
  const title = pageTitle(document, main);
  if (!title || /^page not found/i.test(title)) return null;
  const kind = articleKind(sourcePath);
  if (!kind) return null;
  return { sourcePath, route: articleRoute(kind, title, sourcePath, usedRoutes) };
}

function buildRouteMap(files) {
  const map = new Map();
  const articleRoutes = new Map();
  const usedRoutes = new Set();

  for (const filePath of files) {
    const sourcePath = relativeSourcePath(filePath);
    const basename = path.basename(sourcePath);

    if (isListPath(sourcePath)) {
      map.set(routeKey(sourcePath), sourcePath.startsWith("verein/events") ? "/verein/veranstaltungen/" : "/verein/nachrichten/");
      continue;
    }
    if (isArticlePath(sourcePath) && basename.toLowerCase() !== "details.html") {
      const info = articleSourceInfo(filePath, usedRoutes);
      if (info) {
        map.set(routeKey(sourcePath), info.route);
        map.set(routeKey(sourcePath.replace(/\.html$/i, "")), info.route);
        articleRoutes.set(sourcePath, info.route);
      }
      continue;
    }
    if (["verein/events/details.html", "verein/beitraege/details.html"].includes(sourcePath)) {
      map.set(routeKey(sourcePath), sourcePath.includes("/events/") ? "/verein/veranstaltungen/" : "/verein/nachrichten/");
      continue;
    }
    if (utilityPages.has(sourcePath) || basename.toLowerCase().includes("manifest.json")) continue;
    const document = parse(fs.readFileSync(filePath, "utf8"));
    const contentRoot = findContentRoot(document);
    if (!contentRoot || !pageTitle(document, contentRoot)) continue;
    if (/^page not found/i.test(pageTitle(document, contentRoot))) continue;
    map.set(routeKey(sourcePath), staticRoute(sourcePath));
    map.set(routeKey(sourcePath.replace(/\.html$/i, "")), staticRoute(sourcePath));
  }

  map.set("datenschutzerklaerung", "/rechtliches/datenschutz/");
  map.set("haftungsausschluss", "/rechtliches/haftungsausschluss/");
  return { map, articleRoutes };
}

function byDateDescending(left, right) {
  return (right.date || "").localeCompare(left.date || "") || left.title.localeCompare(right.title, "de");
}

function optimizeMedia() {
  const python = process.env.PYTHON || "python";
  const result = spawnSync(python, [path.join(root, "scripts", "optimize-media.py"), generatedAssets], {
    encoding: "utf8",
    stdio: "inherit"
  });
  if (result.error) {
    throw new Error(`Could not run Python media optimization (${python}): ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`Media optimization failed with exit code ${result.status}. Install requirements from requirements.txt.`);
  }
}

function main() {
  fs.rmSync(generatedAssets, { recursive: true, force: true });
  fs.rmSync(generatedOutput, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(generatedData), { recursive: true });
  walk(archiveRoot);
  sourceFiles.sort();

  const { map: routeBySource } = buildRouteMap(sourceFiles);
  const pages = sourceFiles
    .map((filePath) => {
      const sourcePath = relativeSourcePath(filePath);
      if (utilityPages.has(sourcePath) || isListPath(sourcePath) || sourcePath === "index.html") return null;
      if (isArticlePath(sourcePath) && path.basename(sourcePath).toLowerCase() === "details.html") return null;

      const page = createPageRecord(filePath, routeBySource);
      if (!page || /^page not found/i.test(page.title)) return null;
      return page;
    })
    .filter(Boolean);

  const tableTennisContact = pages.find((page) => page.source === "tischtennis/kontakt-/-hygieneregeln.html");
  if (!tableTennisContact) {
    throw new Error("Could not find the table tennis contact and training-times page.");
  }
  updateTableTennisTraining(tableTennisContact);
  updateTableTennisRosters(pages);

  const importedPages = pages;
  const articles = importedPages.filter((page) => page.kind === "news" || page.kind === "event");
  const archive = {
    pages: importedPages,
    articles,
    news: articles.filter((page) => page.kind === "news").sort(byDateDescending),
    events: articles.filter((page) => page.kind === "event").sort(byDateDescending),
    sections: {
      verein: importedPages.filter((page) => page.section === "verein" && page.kind === "page"),
      sport: importedPages.filter((page) => ["sport", "fussball", "tischtennis"].includes(page.section) && page.kind === "page"),
      rechtliches: importedPages.filter((page) => page.section === "rechtliches" && page.kind === "page")
    }
  };
  archive.homeImage = copyAsset("fileadmin/_processed_/2/d/csm_collage_frontpage_2024-02_16154bba35.jpg");
  if (!archive.homeImage) {
    throw new Error("Could not find the original homepage image in the source archive.");
  }
  const sponsorPage = archive.sections.verein.find((page) => page.title === "Sponsoren");
  if (!sponsorPage) {
    throw new Error("Could not find the sponsors page in the source archive.");
  }
  archive.sponsors = extractSponsorLogos(sponsorPage.content);
  if (archive.sponsors.length === 0) {
    throw new Error("Could not extract sponsor logos from the source archive.");
  }
  archive.recentNews = archive.news.slice(0, 3);
  archive.recentEvents = archive.events.slice(0, 3);

  if (archive.news.length < 50 || archive.events.length < 50) {
    throw new Error(`Archive import incomplete: ${archive.news.length} news and ${archive.events.length} events found.`);
  }

  optimizeMedia();
  fs.writeFileSync(generatedData, `${JSON.stringify(archive, null, 2)}\n`, "utf8");
  console.log(
    `Imported ${archive.news.length} news, ${archive.events.length} events and ` +
    `${archive.sections.verein.length + archive.sections.sport.length + archive.sections.rechtliches.length} pages.`
  );
  console.log(`Copied ${copiedAssets.size} referenced media files.`);
  if (unresolvedAssets.size) {
    console.warn(`Could not resolve ${unresolvedAssets.size} referenced local assets; examples:`);
    for (const asset of [...unresolvedAssets].slice(0, 10)) console.warn(`  ${asset}`);
  }
}

main();
