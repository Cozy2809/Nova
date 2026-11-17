'use strict';
const { createScrapling, scraplingTools } = require('./index');

module.exports = function registerScrapling({ app, tools, confirm, execFile, spawn, handle }) {
  const sc = createScrapling({ appRoot: app.getAppPath(), spawn, execFile, confirm });
  for (const [name, fn] of Object.entries(scraplingTools(sc))) if (!Object.hasOwn(tools, name)) tools[name] = fn;
  handle('scrapling-status', () => sc.status());
  handle('scrapling-install', () => sc.install());
  handle('scrapling-run', (d) => sc.run({ action: d.action === 'crawl' ? 'crawl' : 'page', url: d.url, selector: d.selector, format: d.format, max_pages: d.maxPages }, { interactive: true }));
  return sc;
};
