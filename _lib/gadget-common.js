/**
 * gadget-common.js
 * 
 * Shared helper utilities for OmniUpdate gadgets:
 * - UI helpers (alerts, modals, spinners, breadcrumb/list builders)
 * - CMS data fetchers (assets, binaries, links, locked files, sites/users)
 * - Settings helpers (directory/file access/extensions, publish/unpublish)
 *
 * @author Louis Vulpes
 * @copyright Missouri State University 2024-2026
 **/

/** ======== VARIABLES ======== **/

/**
 * Sites that are considered development / template sites.
 * Used to optionally exclude these from site lists and reports.
 */
const DEV_SITES = ['templates', 'webincludes', 'zz-CMS-Dev', 'zz-Omni-Dev', 'zz-sitetemplate-sgf'];


/* ======== FUNCTIONS ======== */

/** ------ [ADD] ------ **/

async function addAlert(message, type = '', duration = 5000) {

/**
 * Adds a Bootstrap alert into #alerts and optionally auto-dismisses it.
 * @param {string} message - Alert text (currently inserted via innerHTML in generateAlert).
 * @param {string} type - Bootstrap contextual type (primary|secondary|success|warning|danger|info|light|dark).
 * @param {number} duration - ms before fade-out. Use 0 or <0 to keep it.
 */

  // Create the DOM node for the alert
  let alert = generateAlert(message, type);

  // Add it to the alerts container
  getElement('#alerts').appendChild(alert);

  // Auto-remove after duration (fadeOutElement handles transition + removal)
  if (duration > 0) setTimeout(() => fadeOutElement(alert), duration);

}

async function addModal(title, body, confirmText, denyText) {

/**
 * Adds a confirm modal into #modals.
 *
 * NOTE: This function only appends the modal element; it does not show it.
 *
 * @param {string} title
 * @param {string} body - HTML string inserted into modal body
 * @param {string} confirmText
 * @param {string} denyText
 */

  let modal = generateConfirmModal(title, body, confirmText, denyText);

  getElement('#modals').appendChild(modal);

}

/** ------ [ANIMATE] ------ **/

function fadeOutElement(element, ms = 300) {

/**
 * Fades out an element using CSS transitions, then removes it from the DOM.
 *
 * @param {HTMLElement} element
 * @param {number} ms - Duration (milliseconds) for the opacity transition.
 */

  // Apply a transition on opacity
  element.style.transition = `opacity ${ms}ms ease`;

  // Trigger the transition
  element.style.opacity = '0';

  // Remove the element once the transition finishes
  const onEnd = () => {

    element.removeEventListener('transitionend', onEnd);

    element.remove();

  };

  element.addEventListener('transitionend', onEnd);

}

/** ------ [BUILD] ------ **/

async function buildList(config, container , gui = getElement('#list-gui')) {

/**
 * Builds a list UI into `container`, optionally showing/hiding a GUI bar element.
 *
 * If config.list is NOT provided:
 *  - It loads a list using config.type and config.page (when required)
 *  - Then it continues to the render step
 *
 * If config.list IS provided:
 *  - It renders either the empty_text or the generated list
 *
 * @param {Object} config
 * @param {HTMLElement} container - DOM element to receive the generated list
 * @param {HTMLElement|null} gui - Optional GUI element that should be shown when list is ready
 *
 * config.type: 'asset' | 'binary' | 'link' | 'locked' | 'subscriber' | ''
 * config.list: array of items (if preloaded)
 * config.page: {site, path} (required for asset/binary/link/subscriber)
 * config.edit_mode: boolean (passed to generateList to enable checkboxes)
 * config.empty_text: string to display when list is empty
 */

  // Show a spinner while fetching/building
  let spinner = generateSpinner(true);

  if (container.innerHTML !== spinner) container.innerHTML = spinner;

  // Default values + merge caller-provided config
  config = {

    type: '',
    empty_text: 'None found',
    edit_mode: false,
    ...config,

  };

  /**
   * Loader map:
   * Each loader returns { list, empty } where:
   *  - list: array of items to display
   *  - empty: empty-state message for that item type
   */
  const loaders = {
    asset: async () => ({ list: await getAssets(config.page), empty: 'No assets found' }),
    binary: async () => ({ list: await getBinaryFiles(config.page), empty: 'No binary files found' }),
    link: async () => ({ list: await getPageContentLinks(config.page), empty: 'No content links found' }),
    locked: async () => ({ list: await getLockedFiles(), empty: 'No locked files found' }),
    subscriber: async () => ({ list: await getSubscribers(config.page), empty: 'No subscribers found' }),
  };

  // If caller didn't supply a list, fetch it based on config.type
  if (!config.list) {
    const loader = loaders[config.type];
    if (!loader) return; // Nothing to do if unknown type

    // Some loaders require a page object; bail out if missing to avoid API errors
    if (['asset','binary','link','subscriber'].includes(config.type) && !config.page) return;

    const { list, empty } = await loader();
    config.list = list || [];
    config.empty_text = empty;
  }

  // Render empty-state message or clear the container for list insertion
  container.innerHTML = config.list.length
    ? ''
    : `<div class="text-secondary px-1 py-2">${config.empty_text}</div>`;

  // Ensure the GUI controls are visible once list content is ready
  if (gui) gui.classList.remove('d-none');

  // Only add list if container is still empty (prevents double-appends)
  if (container.childNodes.length === 0) container.appendChild(generateList(config.list, config.edit_mode));

}

/** ------ [COLLECT] ------**/

async function collectDirectoryInfo(directory) {

/**
 * Enriches a directory object with:
 * - directories[]: immediate child directories (from files_list)
 * - dm_tag + http_path: directory metadata from the listing result
 *
 * @param {Object} directory - {site, path, ...}
 * @returns {Promise<Object>} same directory object with added properties
 */

  return api.files_list({site : directory.site, path : directory.path})

    .then(data => {

      // Convert API entries into a simplified directories list
      directory.directories = data.entries

        .filter(entry => entry.is_directory) // or (entry.file_type === 'dir')

        .map(entry => ({

          name : entry.file_name,
          site : directory.site,
          path : entry.staging_path,
          dm_tag : entry.dm_tag,
          http_path : entry.http_path,
          no_publish : entry.no_publish,

        }));

      //directory.files = [];

      // Directory-level metadata
      directory.dm_tag = data.dm_tag;

      directory.http_path = data.http_path;

      return directory;

    });

}

async function collectDirectorySettings(directory) {

/**
 * Loads directory settings and copies key fields onto the directory object.
 *
 * @param {Object} directory - {site, path, ...}
 * @returns {Promise<Object>}
 */

  return api.directories_settings({site : directory.site, path : directory.path})

    .then(data => {

      directory.access = (data.access === '') ? 'N/A' : data.access;
      directory.extensions = data.extensions;
      directory.no_publish = data.no_publish;
      directory.template_group = (!data.template_group) ? 'N/A' : data.template_group;
      directory.variables = data.variables;
      directory.inherited_vars = data.inherited_variables;

      return directory;

    });

}

async function collectPageInfo(page) {

/**
 * Loads page listing info from files_list and attaches:
 * - dm_tag, no_publish, locked_by (from first entry)
 *
 * Assumes the API returns the page as data.entries[0].
 * @param {Object} page - {site, path, ...}
 */

return api.files_list({site : page.site, path : page.path})

    .then(data => {

      page.dm_tag = data.entries[0].dm_tag;
      page.no_publish = data.entries[0].no_publish;
      page.locked_by = data.entries[0].locked_by;

      return page;

    });

}

async function collectPageProperties(page) {

/**
 * Loads page properties (title, meta tags, parameters, tags) and attaches them to `page`.
 *
 * @param {Object} page - {site, path, ...}
 */

return api.files_properties({site : page.site, path : page.path})

    .then(data => {

      // Core metadata
      page.title = data.title;

      // Meta tags (assumes both exist)
      page.description = data.meta_tags.find(item => item.name === 'Description').content;
      page.keywords = data.meta_tags.find(item => item.name === 'Keywords').content;

      // Parameters (assumes both exist)
      page.heading = data.parameters.find(item => item.name === 'heading').value;
      page.breadcrumb = data.parameters.find(item => item.name === 'breadcrumb').value;

      // Keep full lists too
      page.parameters = data.parameters;
      page.meta_tags = data.meta_tags;
      page.tags = data.tags;

      return page;

    });

}

async function collectFileSource(file) {
/**
 * Fetches file source and attaches it as `file.source`.
*
 * @param {Object} file - {site, path, ...}
 */

  return api.files_source({site : file.site, path : file.path})

    .then(data => {

      file.source = data.source;

      return file;

    });

}

async function collectFilesSources(files) {

/**
 * Batch version of collectFileSource() for an array.
 * Mutates the objects in-place by adding .source.
 *
 * @param {Array<Object>} files
 * @returns {Promise<Array<Object>>}
 */

  await Promise.all(files.map(file => collectFileSource(file)));

  return files; // Same objects now enriched with .source

}

async function collectTargets(view) {

/**
 * Loads publishing targets for the site and stores them on the view:
 * - view.targets: all targets
 * - view.staging_target: first target containing "-staging"
 */

  return getTargets(view.site)

    .then(targets => {

      view.targets = targets;

      // Identify a staging target by naming convention
      for (let target of targets) if (target.includes('-staging')) view.staging_target = target;

      return view;

    });

}

/** ------ [CREATE] ------ **/

async function createDirectory(name, site, path,  config = {}) {

/**
 * Creates a new folder in the CMS (staging).
 *
 * Safety checks:
 * - name must be non-empty
 * - path must not include '.' (prevents treating it like a file path)
 *
 * @param {string} name - folder name
 * @param {string} site - site name
 * @param {string} path - parent directory path
 * @param {Object} config - currently unused placeholder for future options
 */

  if (name === '' || path.includes('.')) return;

  return api.files_new_folder({name : name, site : site, path : path})

    .then(result => ({

      name : name,
      site : site,
      path : `${path}/${name}`,
      type : 'directory',

    }));

}

/** ------ [ESCAPE] ------ **/

function escapeDmTag (tag = '') {

/**
 * Escapes curly braces for DM tags so they can be used in some regex/string contexts.
 *
 * @param {string} tag
 */

  return tag.replace(/\{/g, '\\{').replace(/\}/g, '\\}');

}

/** ------ [FIND] ------ **/

async function findText(siteName, paths = ['/'], text) {

/**
 * Runs an Omni "find" job (find/replace with replace=false), then polls for results.
 *
 * @param {string} siteName
 * @param {Array<string>} paths - directories to search
 * @param {string} text - search string
 */

  return api.sites_findreplace({

    site : siteName,
    paths : JSON.stringify(paths),
    extensions : ['pcf'],
    srchstr : text,
    replace : false,

  })

    .then(job => getFindReplaceResults(job.id, siteName));

}

/** ------ [GENERATE] ------ */


/* [type]    : [color]
/  primary   : blue
/  secondary : gray
/  success   : green
/  warning   : yellow
/  danger    : red
/  info      : teal
/  light     : white bg + light gray text
/  dark      : dark gray bg + black text
*/

function generateAlert(message, type = '') {

/**
 * Creates an alert element.
 */

  let container = document.createElement('div');

  let closeButton = `<button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span></button>`;

  if (type === '') type = 'primary';

  container.classList.add('alert', `alert-${type}`, 'alert-dismissible', 'mb-2');
  container.setAttribute('role', 'alert');

  container.innerHTML = `<p class="mb-0">${message}</p>${closeButton}`;

  return container;
}

function generateBreadcrumb(view) {

/**
 * Builds a breadcrumb UI for the current `view` object.
 * view.type drives icon choice and trailing tooltip content.
 *
 * @param {Object} view - {site, path, type, filetype?}
 */

  let container = document.createElement('div');

  //container.dataset.toggle = 'tooltip';
  //container.dataset.html = true;

  let breadcrumb = document.createElement('ol');

  breadcrumb.classList.add('breadcrumb', 'mb-2', 'p-2');

  container.appendChild(breadcrumb);

  // Select an icon based on view type + filetype
  let iconName = 

    (view.type === 'dashboard') ? 'home' :

    (view.type === 'directory') ? 'folder' :

    (view.type === 'file' && view.filetype === 'doc') ? 'docs' :

    (view.type === 'file' && view.filetype === 'img') ? 'image' :

    (view.type === 'file') ? 'attachment' :

    (view.type === 'page') ? 'draft' :

    (view.type === 'report') ? 'search' :

    'location_on';

  // Tooltip shown on final crumb
  let tooltip = `<span class='material-symbols-outlined filled mr-1'>${iconName}</span>Current ${view.type === 'other' ? 'location' : view.type}`;

  // Leading icon + refresh link
  let icon = `<span class="material-symbols-outlined filled text-muted mr-1">${iconName}</span>`

  let refresh = `<a href="#" class="text-secondary mr-1" data-toggle="tooltip" title="Refresh" onclick="reloadGadget()"><span class="material-symbols-outlined">refresh</span></a>`;

  breadcrumb.innerHTML = `<li>${icon}${refresh}</li>`;

  // Always start with site crumb
  breadcrumb.appendChild(generateCrumb(view.site, `/browse/staging`, view.path === '/'));

  // If on dashboard, add a terminal "dashboard" crumb
  if (view.type === 'dashboard') breadcrumb.appendChild(generateCrumb('dashboard', ``, true));

  // Split path into crumbs and build a clickable trail
  let crumbs = view.path.split('/');

  let trail = '';

  for (let crumb of crumbs) {

    if (crumb.length === 0) continue; // ignore empty segments

    trail += `/${crumb}`;

    let location = `/browse/staging${trail}`;

    let isLast = crumb === crumbs[crumbs.length - 1];

    // Only last crumb gets tooltip content
    breadcrumb.appendChild(generateCrumb(crumb, location, isLast, `${isLast ? tooltip : ''}`));

  }
  
  return container;

}

function generateCSV(data) {

/**
 * Converts tabular data into a downloadable data URI CSV string.
 * Replaces # because it can break fragment identifiers in data URIs.
 *
 * @param {Array<Array<any>>} data
 */

  let content = 'data:text/csv;charset=utf-8,';

  for (let row of data) content += `${row.join()}\r\n`;

  return encodeURI(content).replace(/#/g, '%23');
}

function generateCrumb(text, location = '', isLast = false, tooltip = '') {

/**
 * Creates a single breadcrumb item.
 * - If not last: clickable, calls setLocation(location)
 * - If last: rendered as plain text and marked active
 */

  let container = document.createElement('li');

  container.classList.add('breadcrumb-item');

  if (isLast) container.classList.add('active');

  container.innerHTML = (!isLast) ? `<a href="#">${text}</a>` : `${text}`;

  // Tooltip setup (Bootstrap)
  container.dataset.toggle = 'tooltip';
  container.dataset.html = true;
  container.title = tooltip;

  if (!isLast) container.querySelector('a').onclick = () => setLocation(location);

  return container;

}

function generatePageAccordion(pages = [], heading, checkboxes = false) {

/**
 * Builds an accordion for a list of pages.
 * Uses Bootstrap collapse (button toggles listContainer).
 *
 * NOTE: [Deprecated]
 */

  let container = document.createElement('div');

  // Use heading for IDs; replace first whitespace run with dash
  let name = heading.replace(/\s+/, '-');

  container.id = `${name}-accordion`;

  let button = `<button class="btn btn-info btn-block text-left" data-toggle="collapse" data-target="#${name}-collapse-list">${name}<span class="float-right">${pages.length}</span></button>`;

  container.innerHTML = `${button}`;

  let listContainer = document.createElement('ul');

  container.appendChild(listContainer);

  listContainer.id = `${name}-collapse-list`;
  listContainer.classList.add('list-group', 'list-group-flush', 'collapse');

  // Early return if there’s nothing to add
  if (pages.length === 0) return container;

  for (let page of pages) listContainer.appendChild(generatePageListItem(page, checkboxes));

  return container;
  
}

function generatePageListItem(page, checkbox = false) {

/**
 * Generates a single page list item linking to preview.
 *
 * NOTE: [Deprecated]
 */

  const CMS_URL_PRE = `${gadget.apihost}/11/#${gadget.skin}/${gadget.account}`;

  let container = document.createElement('li');

  container.classList.add('list-group-item', 'list-group-item-action', 'd-flex', 'px-1');
  
  // External-link icon (visual cue)
  let icon = `<span class="material-symbols-outlined text-info align-self-center ml-1">open_in_new</span>`;

  // Optional checkbox (stores site/path for bulk actions)
  let input = (checkbox) ? `<input class="mr-1" data-site="${page.site}" data-path="${page.path}" value="${page.site},${page.path}" type="checkbox"/> ` : '';

  // Link to preview
  let link = `<a class="text-reset flex-fill" href="${CMS_URL_PRE}/${page.site}/preview${page.path}" target="_blank"><span class="badge badge-pill badge-info">${page.site}</span><br>${page.path}</a>`;

  container.innerHTML = `${input}${link}${icon}`;

  return container;

}

function generateList(list = [], checkboxes = false) {

/**
 * Builds a <ul> list-group container from a list of items.
 * Returns undefined if list is empty.
 */

  if (list.length === 0) return; // early return if empty list

  let container = document.createElement('ul');

  container.classList.add('list-group', 'list-group-flush');

  for (let item of list) container.appendChild(generateListItem(item, checkboxes));

  return container;

}

function generateListItem(item, checkbox = false) {

/**
 * Generates one list-group item based on `item.type`.
 * Supported types: '', 'asset', 'binary', 'page', 'link', 'user'
 */

  const CMS_URL_PRE = `${gadget.apihost}/11/#${gadget.skin}/${gadget.account}`;

  let container = document.createElement('li');

  container.classList.add('list-group-item', 'list-group-item-action', 'd-flex', 'px-1', 'py-2');

  // Accumulators for the pieces we render
  let icon = '';
  let input = '';
  let content = '';

  // ----- Plain string items (type === '') -----
  if (item.type === '') {

    if (checkbox) input = `<input class="mr-1" value="${item}" type="checkbox"/>`;

    content = `${item}`;

  }

  // ----- Asset entries -----
  if (item.type === 'asset') {

    // Checkbox includes metadata for later bulk operations
    if (checkbox) input = `<input
      class="mr-1" 
      data-site="${item.site}"
      data-path="${item.path}"
      data-name="${item.name}"
      data-type="asset"
      value="${item.site},${item.path}"
      type="checkbox"/>`;

    icon = `<span class="material-symbols-outlined text-info align-self-center mr-2">summarize</span>`;

    content = `<a class="text-reset flex-fill text-break" href="${CMS_URL_PRE}/${item.site}/preview${item.path}" target="_blank"><span class="badge badge-pill badge-info">${item.site}</span><br>${item.name}</a>`;

  }

  // ----- Binary (non-PCF) files -----
  if (item.type === 'binary') {

    if (checkbox) input = `<input class="mr-1" data-site="${item.site}" data-path="${item.path}" data-type="binary" value="${item.site},${item.path}" type="checkbox"/>`;

    icon = `<span class="material-symbols-outlined text-info align-self-center mr-2">attachment</span>`;

    // Show site + file extension badges
    let badge = `<span class="badge badge-pill badge-info mr-1">${item.site}</span>`;

    badge += `<span class="badge badge-pill badge-secondary mr-1">${item.path.split('.').pop()}</span>`;

    content = `<a class="text-reset flex-fill text-break" href="${CMS_URL_PRE}/${item.site}/preview${item.path}" target="_blank">${badge}<br>${item.path}</a>`;
  }

  // ----- Page (PCF) entries -----
  if (item.type === 'page') {

    icon = `<span class="material-symbols-outlined text-info align-self-center mr-2">draft</span>`;

    if (checkbox) input = `<input class="mr-1" data-site="${item.site}" data-path="${item.path}" data-type="page" value="${item.site},${item.path}" type="checkbox"/>`;

  content = `<a class="text-reset flex-fill text-break" href="${CMS_URL_PRE}/${item.site}/preview${item.path}" target="_blank"><span class="badge badge-pill badge-info">${item.site}</span><br>${item.path}</a>`;

  }

  // ----- Content links extracted from HTML -----
  if (item.type === 'link') {

    if (checkbox) input = `<input class="mr-1" data-link="${item.href}" data-link-text="${item.text}" data-type="link" value="${item.href}" type="checkbox"/>`;

    icon = `<span class="material-symbols-outlined text-info align-self-center mr-2">link</span>`;

    // Display URL sans scheme by default
	let displayUrl = item.href.replace(/^https?:\/\//, '');

    let badge = '';

    // Protocol badges
    if (item.href.startsWith('https')) badge = `<span class="badge badge-pill badge-info mr-1">https</span>`;

    else if (item.href.startsWith('http')) badge = `<span class="badge badge-pill badge-warning mr-1">http</span>`;

    // Fragment badge (e.g., #section)
	if (item.href.includes('#')){

      badge += `<span class="badge badge-pill badge-dark mr-1">#${item.href.split('#').pop()}</span>`;
		
	}

    // Special-case: Omni "linked image" URLs
	if (item.href.includes('a.cms.omniupdate.com')){

      badge = `<span class="badge badge-pill badge-danger mr-1">linked image</span>`;

	}

    // mailto badge
    if (item.href.startsWith('mailto:')) {

      badge = `<span class="badge badge-pill badge-info">mailto</span>`;

    }

    // Heuristic: if href contains '@', treat it as an email address link
    if (item.href.includes('@')) {

      icon = `<span class="material-symbols-outlined text-info align-self-center mr-2">mail</span>`;

      if (item.href.startsWith('mailto:')) {

        badge = `<span class="badge badge-pill badge-info mr-1">mailto</span>`;

        displayUrl = item.href.replace(/^mailto:/, '');

      }

        else {

          badge = `<span class="badge badge-pill badge-danger mr-1">no mailto</span>`;

        }

    }

    // Heuristic: phone number-ish ending => treat as phone link
    if (item.href.match(/([\d\s().-]{7,})$/)) {

      icon = `<span class="material-symbols-outlined text-info align-self-center mr-2">call</span>`;

        if (item.href.startsWith('tel:')) {

          badge = `<span class="badge badge-pill badge-info mr-1">tel</span>`;

          displayUrl = item.href.replace(/^tel:/, '');

        }

        else {

          badge = `<span class="badge badge-pill badge-danger mr-1">no tel</span>`;

        }

    }

    // Assemble link content block
    content = `<div class="flex-fill">`;

    content += `${badge}${(badge !== '') ? '<br>' : ''}`;

    content += `<span class="font-weight-bold">${item.text}</span><br>`;

    content += `<a class="text-muted text-break" href="${item.href}" target="_blank">${displayUrl}</a>`;

    content += `</div>`;

  }

  // ----- User entries -----
  if (item.type === 'user') {

    if (checkbox) input = `<input class="mr-1" data-user="${item.username}" value="${item.username}" type="checkbox"/>`;

    icon = `<span class="material-symbols-outlined filled text-info align-self-center mr-2">person</span>`;

    // Link to user setup page
    content = `<a class="text-reset flex-fill text-break" href="${CMS_URL_PRE}/${gadget.site}/setup/users/${item.username}" target="_blank">${item.reverse_name}<br><span class="badge badge-pill badge-info">${item.username}</span></a>`;

  }

  // Final render for list item
  container.innerHTML = `${input}${icon}${content}`;

  return container;

}

function generateSpinner(asString = false) {

/**
 * Creates a Bootstrap spinner.
 *
 * @param {boolean} asString - return the DOM node or its outerHTML string
 */

  let container = document.createElement('div');

  container.classList.add('spinner-border', 'spinner-border-sm', 'spinner-grow-sm');
  container.setAttribute('role', 'status');
  container.innerHTML = '<span class="sr-only">Loading...</span>';

  return (!asString) ? container : container.outerHTML;

}

function generateModal(title, body, closeText = 'Close') {

/**
 * Generic modal builder (close button only).
 *
 * @param {string} title
 * @param {string} body - HTML string
 * @param {string} closeText
 */

  let container = document.createElement('div');

  container.id = `${title.replace(/ /g, '-').toLowerCase()}-modal`;
  container.classList.add('modal','fade')
  container.tabIndex = -1;
  container.setAttribute('role', 'dialog'); 

  container.innerHTML = `
    <div class="modal-dialog modal-dialog-centered" role="document">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">${title}</h5>
          <button type="button" class="close" data-dismiss="modal" aria-label="Close">
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
        <div class="modal-body">
          ${body}
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary" data-dismiss="modal">${closeText}</button>
        </div>
      </div>
    </div>
  `;

  return container;

}

function generateConfirmModal(title, body, confirmText, denyText) {

/**
 * Confirm modal builder.
 * confirm button calls runConfirm('<lowercased confirmText>')
 */

  let container = document.createElement('div');

  container.id = `${title.replace(' ', '-').toLowerCase()}-modal`;
  container.classList.add('modal','fade')
  container.tabIndex = -1;
  container.setAttribute('role', 'dialog'); 

  container.innerHTML = `
    <div class="modal-dialog modal-dialog-centered" role="document">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">${title}</h5>
          <button type="button" class="close" data-dismiss="modal" aria-label="Close">
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
        <div class="modal-body">
          ${body}
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary" data-dismiss="modal">${denyText}</button>
          <button type="button" class="btn btn-primary" onclick="runConfirm('${confirmText.toLowerCase()}');" value="${confirmText.toLowerCase()}" data-dismiss="modal">${confirmText}</button>
        </div>
      </div>
    </div>
  `;

  return container;

}

async function generateZIP(files = [], startingDirectory = '/') {

/**
 * Creates a ZIP (Blob URL) from a list of file objects that have .source.
 *
 * @param {Array<Object>} files - each must have {path, source}
 * @param {string} startingDirectory - path prefix to remove when naming files inside zip
 * @returns {Promise<string>} object URL for the zip blob
 */

  let proms = [];

  let zipper = new zip.ZipWriter(new zip.BlobWriter('application/zip'));

  for (let file of files) {

    // Make zip-internal path relative to startingDirectory
    let filepath = file.path.slice(startingDirectory.length + 1);

    // Only add files where we have source contents available
    if (file.source) proms.push(zipper.add(filepath, new zip.TextReader(file.source)));

  }

  // Always close the zip last
  proms.push(zipper.close());
  
  // zipper.close() resolves to the zip blob (last promise)
  return Promise.all(proms)

    .then(blob => URL.createObjectURL(blob.pop()));

}

/** -------- [GET] -------- **/

/** ---- [GET ACCESS] ---- **/

async function getAccessGroups() {

/**
 * Returns a map of access group name => array of members
 * (member list is split by ", " unless it is "N/A")
 */

  return api.reports_custom({report : 'groups', g_memberlist: 'on'})

    .then(report => {

      let groups = {};

      for (let entry of report.records) groups[entry.g_name] = (entry.g_memberlist === 'N/A') ? [] : entry.g_memberlist.split(', ');

      return groups;

    });

}

/** ---- [GET ASSETS] ---- **/

async function getAssets(page) {

/**
 * Returns dependency entries of type 'a' (assets) for a given page.
 * Output items are normalized to {site, name, path, type:'asset'}.
 */

  return api.files_dependencies({site : page.site, path : page.path})

    .then(data => {

      if (data.dependencies) return data.dependencies

        .filter(entry => entry.type === 'a')

        .map(entry => ({

          site : entry.site,
          name : entry.name,
          path : entry.path,
          type : 'asset',

        }));

      // If API returned unexpected shape, pass through raw data
      return data;

    });

}

/** ---- [GET BINARY FILES] ---- **/

async function getBinaryFiles(page) {

/**
 * Returns dependency entries of type 'f' (files) excluding .pcf for a given page.
 * Output items are normalized to {site, path, type:'binary'}.
 */

  return api.files_dependencies({site : page.site, path : page.path})

    .then(data => {

      if (data.dependencies) return data.dependencies

        .filter(entry => entry.type === 'f')

        .filter(entry => !entry.path.includes('.pcf'))

        .map(entry => ({

          site : entry.site,
          path : entry.path,
          type : 'binary',

        }));

      return data;

    });

}

/** ------ [GET COMPONENT] ------ **/

async function getComponents() {

/**
 * Returns the component list (Omni component API).
 */

  return api.components_list();

}

async function getComponentDependents(name) {

/**
 * Returns pages that depend on a given component name.
 * Normalizes output to page objects with a generated dm_tag.
 */

  return api.components_dependents({name : name})

    .then(data => data

      .map(entry => ({

        site : entry.sitename,
        path : entry.path,
        dm_tag : '{{f:' + entry.pageID + '}}',
        type : 'page',

      })));

}

/** ------ [GET CURRENT] ------ **/

async function getCurrentFile() {

/**
 * Attempts to get the current file from the gadget context.
 * Normalizes to a common view/file object shape.
 */

  return gadget.getFileInfo()

    .then(data => {

      if (!data) return data;

      return {

        site : data.site,
        path : data.stagingPath,
        filename : data.filename,
        http_path : data.productionUrl,
        lock_status : data.lockStatus,
        filetype : data.type,
        type : (data.type === 'pcf') ? 'page' :'file',

      }

    });

}

async function getCurrentLocation() {

/**
 * Uses window hash routing to infer the current view when there is no file context.
 * view.type can be: directory | dashboard | report | other
 */

  return gadget.getLocation()

    .then(location => {

      let view = { site : gadget.site };

      let hash = location.hash;

      let hashBase = `#${gadget.skin}/${gadget.account}/${gadget.site}`;

      let directoryHash = `${hashBase}/browse/staging`;

      // Directory browsing route
      if (hash.startsWith(directoryHash)) {

        view.path = (hash === directoryHash) ? '/' : hash.replace(directoryHash, '');
        view.type = 'directory';

      }

      // Dashboard route
      if (hash.replace(/\/$/, '') === hashBase) {

        view.path = '';
        view.type = 'dashboard';

      }

      // Report route
      if (hash.startsWith(`${hashBase}/reports`)) {

        view.path = hash.replace(hashBase, '');
        view.type = 'report';

      }

      // Fallback route
      if (!view.type) {

        view.path = hash.replace(hashBase, '');
        view.type = 'other';

      }

      return view;

    });

}

async function getCurrentView() {

/**
 * Returns the best-available current view:
 * - file context if available
 * - otherwise inferred from URL hash
 */

  return getCurrentFile()

    .then(file => (file) ? file : getCurrentLocation());

}


/** ------ [GET DM TAG] ------ **/

async function getDependencyTag(page) {

/**
 * Returns the dependency tag (dm_tag) for a page.
 * Assumes files_list returns the page as entries[0].
 */

  return api.files_list({site : page.site, path : page.path})

    .then(data => data.entries[0].dm_tag);

}

async function getDirectoryDmTag(directory) {

/**
 * Returns directory dm_tag for a directory.
 */

  return api.files_list({site : directory.site, path : directory.path})

    .then(data => data.dm_tag);

}

async function getDmTagByUrl(url) {

/**
 * Converts a public URL into a CMS dependency tag by:
 * 1) normalizing scheme
 * 2) resolving domain -> site
 * 3) walking the path piece-by-piece using getDirectoryEntry() (case-insensitive match)
 * 4) converting extensions to .pcf where relevant
 * 5) getting the dependency tag for the final resolved path
 *
 * NOTE: This does multiple sequential awaits in a loop (can be slower on deep paths).
 */

  if (url.startsWith('http://')) url = url.replace('http://', 'https://');

  if (!url.startsWith('http')) url = `https://${url}`;

  let urlObj = new URL(url);

  // We build the CMS path incrementally by resolving each segment
  let path = '';
  
  let parts = urlObj.pathname.split('/').filter(item => item);

  // Find which CMS site corresponds to the domain
  let site = await getSiteByDomain(urlObj.hostname);

  for (let part of parts) {

    // Normalize extension to CMS page extension
    if (part.includes('.')) part = part.replace(/\.(htm|aspx)$/i, '.pcf');

    // Resolve actual entry name (handles case/canonical names)
    let entry = await getDirectoryEntry({site : site, path : path} , part);

    part = entry.file_name;

    path += `/${part}`;

  }

  // Default file behavior for root and directories
  if (parts.length === 0) path = '/default.htm';

  if (!path.includes('.')) path += '/default.htm';

  return getDependencyTag({ site : site, path : path });

}

/** ------ [GET DIRECTORY] ------ **/

async function getDirectories(directory, includeSubdirs = false, filters = []) {

/**
 * Gets directories using a custom "directories" report.
 * Filters out common excluded folders plus any caller-provided filters.
 *
 * @param {Object|string} directory - directory object OR starting path string
 * @param {boolean} includeSubdirs - include nested directories or only exact startPath
 * @param {Array<string>} filters - additional path substrings to exclude
 */

  let startPath = (typeof directory === 'string') ? directory : directory.path

  return api.reports_custom({

    report : 'directories',
    d_address : 'on',
    d_access : 'on',
    d_dtag : 'on',
    //d_tmplgroup : 'on',
    //d_dirvariables : 'on',
    d_address_str : startPath,

    })

    .then(report => report.records

      .filter(entry => {

        // If not including subdirs, only keep directories exactly at startPath
        if (!includeSubdirs) if (entry.d_address !== startPath) return false;

        // Exclusion list + caller filters
        if (['/_navigation', '/_resources', '/bin', ...filters].some(value => entry.d_address.includes(value))) return false;

        return true;

      })

      .map(entry => ({

        site : gadget.site,
        path : entry.d_address,
        dm_tag : entry.d_dtag,
        access : entry.d_access,
        //template_group : entry.d_tmplgroup,
        //variables : entry.d_dirvariables,
        http_path : `${gadget.site}${entry.d_address}`,
        type : 'directory',

      })));

}

async function getDirectoryFiles(directory, includeSubdirectories = false, filters = []) {

/**
 * Gets files/pages within a directory using "products" report.
 * Optionally limits to direct children (no deep recursion).
 */

  return api.reports_custom({

    report : 'products',
    pd_address : 'on',
    pd_access : 'on',
    pd_dtag : 'on',
    pd_address_str : directory.path,
    pd_filename : 'on'

  })

    .then(report => report.records

        .filter(entry => {

          if (!includeSubdirectories) {

            // Determine how deep this item is under the selected directory
            let subpath = entry.pd_address.replace(directory.path, '');

            if (subpath.split('/').length > 2) return false;

          }

          // Exclude common folders and caller filters
          if (['/_navigation/', '/_resources/', '/bin/', ...filters].some(value => entry.pd_address.includes(value))) return false; // ignore folders check

          return true;

        })

        .map(entry => ({

          site : gadget.site,
          path : entry.pd_address,
          dm_tag : entry.pd_dtag,
          access : entry.pd_access,
          filename : entry.pd_filename,
          // Convert report path into a usable URL-ish path by swapping filename
          http_path : `${gadget.site}${entry.pd_address.replace(entry.pd_address.split('/').pop(), entry.pd_filename)}`,
          type : (entry.pd_address.includes('.pcf')) ? 'page' : 'file',

        })));

}

async function getDirectoryEntries(directory) {

/**
 * Returns raw directory entries (files_list).
 */

  return api.files_list({ site : directory.site, path : directory.path })

    .then(data => data.entries);

}

async function getDirectoryEntry(directory, name) {

/**
 * Finds an entry in a directory by filename, case-insensitive.
 * Returns the matching entry object or undefined.
 */

  return getDirectoryEntries(directory)

    .then(entries => {

      for (let entry of entries) {

        if (entry.file_name.toLowerCase() === name.toLowerCase()) return entry;

      }

      return;

    });

}

async function getDirectorySettings(directory) {

/**
 * Returns directory settings as a standalone object (does not mutate input).
 */

  return api.directories_settings({site : directory.site, path : directory.path})

    .then(data => {

      let settings = {};

      settings.access = (data.access === '') ? 'N/A' : data.access;
      settings.extensions = data.extensions;
      settings.no_publish = data.no_publish;
      settings.template_group = (!data.template_group) ? 'N/A' : data.template_group;
      settings.variables = data.variables;
      settings.inherited_vars = data.inherited_variables;

      return settings;

    });

}

/** ------ [GET ELEMENT] ------ **/

function getElement(query) {

/**
 * Small DOM helper: returns the first match or null.
 */

  return document.querySelector(query);

}

function getElementText(element) {

/**
 * Extracts only direct TEXT_NODE content from an element.
 * (Ignores text content inside nested child elements.)
 */

  let text = '';

  for (let node of element.childNodes) if (node.nodeType === Node.TEXT_NODE) text += node.textContent;

  return text;

}

/**
 * Returns NodeList or null if empty.
 * NOTE: Returning null forces callers to null-check;
 */
function getElements(query) {

/**
 * Returns NodeList or null if empty.
 * NOTE: Returning null forces callers to null-check.
 */

  let list = document.querySelectorAll(query);

  return (list.length === 0) ? null : list;

}

/** ------ [GET FIND RESULTS] ------ **/

async function getFindReplaceResults(id, site, {

  initialDelayMs = 750,
  maxDelayMs = 5000,

  } = {}) {

/**
 * Polls a find/replace job until it finishes.
 * Includes a simple delay backoff to reduce API load.
 *
 * @param {string|number} id
 * @param {string} site
 * @param {Object} options
 * @param {number} options.initialDelayMs
 * @param {number} options.maxDelayMs
 */

  let delay = initialDelayMs;

  while (true) {

    await new Promise(r => setTimeout(r, delay));

    const results = await api.sites_findreplacestatus({ id, site });

    if (results.finished) return results;

    // Backoff: increase delay up to the cap
    delay = Math.min(maxDelayMs, Math.round(delay * 1.3));

  }

}

async function getLatestVersion(file) {

/**
 * Returns latest revision number (0 if no versions exist).
 */

  return api.files_versions({site : file.site, path : file.path})

    .then(versions => (!versions[0]) ? 0 : versions[0].revision);

}

async function getLockedFiles() {

/**
 * Gets locked files across all sites (optionally including dev sites).
 * Normalizes entry types into 'binary' or 'page' where applicable.
 */

  return getSites(false)

    .then(sites => {

      let promises = [];

      for (let site of sites) promises.push(api.files_locked({site : site.name})

        .then(data => {

          return data.filter(entry => {

            // Skip assets
            if (entry.type === 'asset') return false;

            // Skip recycled items
            if (entry.path.includes('/recycle_bin')) return false; 

            // Annotate site onto each entry
            entry.site = site.name;

            // Normalize file types into your UI categories
            if (entry.type === 'img' || entry.type === 'doc') entry.type = 'binary';

            if (entry.type === 'pcf' || entry.type === 'txt' || entry.type === 'html') entry.type = 'page';

            return true;

          });

        }));

      // Flatten per-site results into one array
      return Promise.all(promises)

        .then(results => results.flat());

    });

}

/** ------ [GET PAGE] ------ **/

async function getPageContent(page, labels = []) {

/**
 * Gets page content:
 * - If no labels: returns the default content response
 * - If labels: fetches each label version and flattens results
 */

  if (labels.length === 0) return api.files_content({site : page.site, path : page.path});

  let promises = [];

  for (let label of labels) promises.push(api.files_content({site : page.site, path : page.path, label : label}));

  return Promise.all(promises)

    .then(results => results.flat());

}

async function getPageContentLinks(page) {

/**
 * Parses the page HTML content and extracts all links in <main>.
 * Returns a normalized array of {href, text, type:'link'}.
 *
 * NOTE: Uses Document.parseHTMLUnsafe - assumes the environment provides it.
 */

  // Lazy-load content if not already present
  if (!page.content) page.content = await getPageContent(page);
	
  let html = Document.parseHTMLUnsafe(page.content);

  let elements = [...html.querySelectorAll('main a[href]')];

  return elements.map(entry => ({

    href : entry.href,
    text : entry.innerText,
    type : 'link',

  }));

}

async function getPageSource(page, label = '') {

/**
 * Returns source (code) of a page.
 * Optional label lets you fetch a specific version.
 */

  let config = {

    site : page.site,
    path : page.path,

  };

  if (label != '') config.label = label;

  return api.files_source(config)

    .then(data => data.source);

}

async function getPageUrl(page) {

/**
 * Returns public http_path for a page.
 */

  return api.files_list({site : page.site, path : page.path})

    .then(data => data.entries[0].http_path);

}

async function getPublishingStatus(page) {

/**
 * Returns no_publish flag for a page (publishing status).
 */

  return api.files_settings({site : page.site, path : page.path})

    .then(data => data.no_publish);

}

/** ------ [GET SITE] ------ **/

async function getSiteByDomain(domain) {

/**
 * Maps a domain to a CMS site by comparing api.sites_list() URLs.
 * Returns site name or null if not found.
 */

  domain = domain.toLowerCase();

  return api.sites_list()

    .then(list => {

      for (let entry of list) {

        let siteUrl = entry.url.toLowerCase().replace('https://', '').replace(/\/$/, '');

        if (siteUrl === domain) return entry.site

      }

      return null;

    });

}

async function getSiteList(excludeDevSites = true) {

/**
 * Returns an array of site names, optionally excluding DEV_SITES.
 */

  return api.sites_list()

    .then(list => {

      let filtered = (excludeDevSites) ?

        list.filter(entry => !DEV_SITES.includes(entry.site)) :

        list;

      return filtered.map((entry) => entry.site);

    });

}

async function getSites(excludeDevSites = true) {

/**
 * Returns list of sites from a custom "sites" report.
 * Filters:
 * - optional dev sites exclusion
 * - only records where s_name === s_targetname (avoids aliases/duplicates)
 */

  return api.reports_custom({site : gadget.site, report : 'sites', s_serverpath : 'on'})

    .then(report => {

      return report.records

        .filter((entry) => !(excludeDevSites && DEV_SITES.includes(entry.s_name)))

        .filter((entry) => entry.s_name === entry.s_targetname)

        .map((entry) => ({

          name : entry.s_name,
          http_path : entry.s_serverpath.replace(/\/$/, ''),

        }));

    });

}

/** ------ [GET SUBSCRIBERS] ------ **/

async function getSubscribers(page) {

/**
 * Returns page subscribers for a given page, normalized to {site, path, type:'page'}.
 */

  return api.files_products({site : page.site, path : page.path, subscribers : true})

  .then(data => {

    if (data[0].subscribers.pages) return data[0].subscribers.pages

      .filter(entry => entry.sitename && entry.path)

      .map(entry => ({site : entry.sitename, path : entry.path, type : 'page'}));

    return;

  });

}

/** ------ [GET TARGET] ------ **/

async function getStagingTarget(site) {

/**
 * Convenience helper: returns the first target containing "-staging".
 */

  return getTargets(site).then(targets => {

      for (let target of targets) if (target.includes('-staging')) return target;

      return;

    });

}

async function getTargets(site) {

/**
 * Returns list of publishing targets for a site.
 */

  return api.sites_targets({ site : site })

    .then(data => data.targets);

}


/** ------ [GET TODAY] ------ **/

function getToday() {

/**
 * Returns today as a date string in the format [YYYY-MM-DD].
 * Uses 'en-CA' locale because it formats ISO-like date strings.
 */

  return new Date().toLocaleDateString('en-CA');

}

/** ------ [GET USER] ------ **/

async function getUser(username = '') {

/**
 * Returns user info:
 * - if username is empty -> current user
 * - else -> specific user
 */

  if (!username) return api.users_view();

  return api.users_view({ user : username });    

}

async function getUsers() {

/**
 * Returns a map: username -> user object (normalized fields).
 */

  return api.users_list()

    .then(data => {

      let users = {};

      for (let user of data) {

        if (user.username) users[user.username] = {

          first_name : user.first_name,
          last_name : user.last_name,
          username : user.username,
          full_name : `${user.first_name} ${user.last_name}`,
          reverse_name : `${user.last_name}, ${user.first_name}`,
          type : 'user',

        }

      }

      return users;

    });

}

/** -------- [GROUP] -------- **/

function groupByProperty(array, property) {

/**
 * Groups an array of objects by a property value.
 *
 * @param {Array<Object>} array
 * @param {string} property - key name to group by
 * @returns {Object} { [propertyValue]: [entries...] }
 */

  return array.reduce((acc, entry) => { // acc = accumulator

    let key = entry[property];

    if (!acc[key]) acc[key] = [];

    acc[key].push(entry);

    return acc;

  }, {});

}

/* -------- [INIT] -------- */

async function initTooltips() {

/**
 * Initializes Bootstrap tooltips.
 * Removes any existing tooltip bubble before re-initializing.
 */

  let old = getElement('.tooltip.fade.show');

  if (old) old.remove();

  // Only initialize tooltips that haven't already been initialized
  $('[data-toggle="tooltip"]:not([data-original-title])').tooltip({container : 'body', trigger : 'hover'});

}

/** ------ [LOAD] ------ **/

async function loadBreadcrumb(view) {

/**
 * Renders breadcrumb UI into #breadcrumb container.
 *
 * @param {Object} view
 */

  let container = getElement('#breadcrumb');

  container.innerHTML = '';

  return container.appendChild(generateBreadcrumb(view));

}

/* -------- [PUBLISH][UNPUBLISH] -------- */

async function publishPage(page, target = '', override = false) {

/**
 * Publishes a page to a target.
 * @param {Object} page - {site, path}
 * @param {string} target - optional target override
 * @param {boolean} override - publish even if warnings/locks allow override
 */

  let config = {site : page.site, path : page.path};

  if (target !== '') config.target = target;

  if (override) config.override = true;

  return api.files_publish(config);

}

async function publishPageFull(page) {

/**
 * Publishes to all targets found for the page's site.
 * Ensures `page.targets` exists.
 */

  let promises = [];

  if (!page.targets) page.targets = await getTargets(page.site);

  for (let target of page.targets) promises.push(publishPage(page, target, true));

  return Promise.all(promises);

}

async function unpublishPage(page, target = '') {

/**
 * Unpublishes (deletes remote) for a page.
 */

  let config = {

    site : page.site,
    path : page.path,
    remote : true,

  };

  if (target !== '') config.target = target;

  return api.files_delete(config);

}

/** ------ [REPLACE] ------ **/

async function replaceText(siteName, paths = ['/'], text = '', replacement = '') {

/**
 * Runs a find/replace job across paths and waits for completion.
 * include_components=true enables searching component content.
 */

  return api.sites_findreplace({

    site : siteName,
    extensions : ['pcf'],
    paths : JSON.stringify(paths),
    srchstr : text,
    replace : true,
    rplcstr : replacement,
    include_components : true,
    log : 'FindReplace : Replaced text',
    //casesensitive : true,

  })

    .then(job => getFindReplaceResults(job.id, siteName));

}

/** ------ [SET] ------ **/

async function setDirectoriesAccess(directories, access) {

/**
 * Sets access for many directories.
 * Returns counts of updated vs already-correct.
 */

  let promises = [];

 // Only update directories that don't already have the desired access
  let filtered = directories.filter(entry => entry.access !== access);

  for (let directory of filtered) promises.push(setDirectorySettings(directory, {access : access}));

  return Promise.all(promises)

    .then(results => ({

      updated : results.length,
      verified : (directories.length - results.length),

    }));

}

async function setDirectoriesExtensions(directories, extensions) {

/**
 * Sets extensions for many directories.
 * Returns counts of updated vs already-correct.
 */

  let promises = [];

  let filtered = directories.filter(entry => entry.extensions !== extensions);

  for (let directory of filtered) promises.push(setDirectorySettings(directory, {extensions : extensions}));

  return Promise.all(promises)

    .then(results => ({

      updated : results.length,
      verified : (directories.length - results.length),

    }));

}

async function setDirectorySettings(directory, settings = {}) {

/**
 * Updates directory settings by:
 * 1) fetching current settings
 * 2) building a POST payload with existing values
 * 3) overlaying caller changes (including directory variables)
 *
 * NOTE: Directory variables are sent as keys prefixed with '_' in the payload.
 */

  return api.directories_settings({site : directory.site, path : directory.path})

    .then(data => {

      let config = {

        site : directory.site,
        path : directory.path,
        access : data.access,
        approver : data.approver,
        enforce_approver : data.enforce_approver,
        exclude_orphan : data.exclude_orphan,
        extensions : data.extensions,
        feed : data.feed,
        image_size_set : data.image_size_set,
        negate_extensions : data.negate_extensions,
        no_publish : data.no_publish,
        no_search : data.no_search,
        no_sitemap : data.no_sitemap,
        publishers : data.publishers,
        template_group : data.template_group,
        toolbar : data.toolbar,
        tracking_enabled : data.tracking_enabled,
        url_type : data.url_type,
        webhooks : data.webhooks,

      };

      // Attach existing variables as _varName keys
      for (let key of Object.keys(data.variables)) config['_'+key] = data.variables[key];

      // Overlay direct setting overrides
      for (let key of Object.keys(settings)) config[key] = settings[key];

      // Overlay variable overrides (settings.variables) using _varName keys
      if (settings.variables) for (let key of Object.keys(settings.variables)) config['_'+key] = settings.variables[key];

      return api.directories_settings(config, 'POST');

    });

}

async function setFileSettings(file, settings = {}) {

/**
 * Updates file settings similarly to setDirectorySettings():
 * 1) fetch current settings
 * 2) build POST payload using existing values
 * 3) overlay caller overrides
 */

  return api.files_settings({site : file.site, path : file.path})

    .then(data => {

     let config = {

        site : file.site,
        path : file.path,
        access : data.access,
        approver : data.approver,
        enforce_approver : data.enforce_approver,
        exclude_orphan : data.exclude_orphan,
        dynamic_page_forward_uuid : data.dynamic_page_forward_uuid,
        feed : data.feed,
        no_publish : data.no_publish,
        no_search : data.no_search,
        no_sitemap : data.no_sitemap,
        page_forwarding : data.page_forwarding,
        publishers : data.publishers,
        toolbar : data.toolbar,
        tracking_enabled : data.tracking_enabled,
        url_type : data.url_type,

      };

      // Remove falsy entries to avoid sending empty fields
      for (let key of Object.keys(config)) if (!config[key]) delete config[key];

      // Overlay caller overrides
      for (let key of Object.keys(settings)) config[key] = settings[key];

      return api.files_settings(config, 'POST');

    });

}

async function setFilesAccess(files, access) {

/**
 * Sets access for many files.
 * Returns counts of updated vs already-correct.
 */

  let promises = [];

  let filtered = files.filter(entry => entry.access !== access);

  for (let file of filtered) promises.push(setFileSettings(file, {access : access}));

  return Promise.all(promises)

    .then(results => ({

      updated : results.length,
      verified : (files.length - results.length),

    }));

}

async function setLocation(location = '/') {

/**
 * Updates gadget location (hash routing).
 *
 * @param {string} location - relative location path
 */

  return gadget.setLocation(location);

}


async function setView(view) {

/**
 * Converts a view object into a gadget location string.
 * - "document/file/image/page" types => preview route
 * - "directory" => browse route
 * - otherwise => view.path as-is
 */

  if (gadget.site !== view.site) return;

  let location = (['document', 'file', 'image', 'page'].includes(view.type)) ? `/preview${view.path}` :

    (view.type === 'directory') ? `/browse/staging${view.path}` :

    view.path;

  return setLocation(location);

}

/* -------- [SORT] -------- */

function sortObjs(arr, sortKey) {

/**
 * Sorts objects by sortKey.
 * - Strings use localeCompare
 * - null/undefined values sort last
 *
 * @param {Array<Object>} arr
 * @param {string} sortKey
 * @returns {Array<Object>} new sorted array (does not mutate original)
 */

  return [...arr].sort((a, b) => {
    const av = a?.[sortKey];
    const bv = b?.[sortKey];

    if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;

    return av < bv ? -1 : av > bv ? 1 : 0;
  });

}


function sortUsersByCase(a, b) {

/**
 * Sort comparator for user objects that prioritizes case-insensitive ordering,
 * but preserves deterministic ordering when only case differs.
 */

  let nameA = a.reverse_name;
  let nameB = b.reverse_name;

  if (nameA.toLowerCase() < nameB.toLowerCase()) return -1;

  if (nameA.toLowerCase() > nameB.toLowerCase()) return 1;

  if (nameA < nameB) return -1;

  if (nameA > nameB) return 1;

  return 0;

}

/** -------- [TOGGLE] -------- **/

async function toggleLoading() {

/**
 * Toggles between #loading panel and #main panel.
 * Useful for switching between "busy" and "ready" UI states.
 */

  getElement('#loading').classList.toggle('d-none');
  getElement('#main').classList.toggle('d-none');

}

/** ------ [UNLOCK] ------ **/

async function unlockFile(file) {

/**
 * Forces check-in (unlock) of a file.
 * override:true means it will unlock even if another user locked it.
 */

  return api.files_checkin({site : file.site, path : file.path, override : true});

}

async function unlockFiles(files) {

/**
 * Unlocks a batch of files in parallel.
 *
 * @param {Array<Object>} files - {site, path}
 */

  let promises = [];

  for (let file of files) promises.push(unlockFile(file));

  return Promise.all(promises);

}