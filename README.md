# SV Hagenbüchach – statische Website

This project is the maintainable source for a static HTML rebuild. The HTTrack
download remains in `sv-hagenbuechach.de/sv-hagenbuechach.de` as the content
archive. The import script extracts article and page content, rewrites internal
links, copies only referenced media, and optimizes large JPEGs for web delivery.
Generated output is written to `dist/`.

## Development

- Install dependencies with `npm install`.
- Install media optimization dependencies with `python -m pip install -r requirements.txt`.
- Build the site and import the archive with `npm run build`.
- Preview the site locally with `npm run serve`.

Shared markup is in `site/_includes/layouts/`; theme colors and
responsive/accessibility styles are in `site/assets/css/site.css`. Imported
pages and referenced images are generated during the build and are not edited
by hand. The theme selector offers the club, Halloween, autumn, and floodlight
themes, and stores the selected theme in the browser.

News and event entries remain individual pages and are grouped into generated
archive indexes. General pages are organized into sport, club, and legal
sections. Review imported contact details and legal content before publishing
`dist/`; the import preserves source text and does not verify whether it is
current.
