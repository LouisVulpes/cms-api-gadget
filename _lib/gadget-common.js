/**
 * gadget-common.js
 * 
 * @author Louis Vulpes
 * @copyright Missouri State University 2024-2026
 **/

/** ======== VARIABLES ======== **/

const DEV_SITES = ['templates', 'webincludes', 'zz-CMS-Dev', 'zz-Omni-Dev', 'zz-sitetemplate-sgf'];


/* ======== FUNCTIONS ======== */

/** ------ [ADD] ------ **/

async function addAlert(message, type = '', duration = 5000) {

  let alert = generateAlert(message, type);

  getElement('#alerts').appendChild(alert);

  if (duration > 0) setTimeout(() => fadeOutElement(alert), duration);

}

async function addModal(title, body, confirmText, denyText) {

  let modal = generateConfirmModal(title, body, confirmText, denyText);

  getElement('#modals').appendChild(modal);

}

/** ------ [ANIMATE] ------ **/

function fadeOutElement(element, duration = 50) {

  let opacity = 1;

  const timer = setInterval(() => {

    if (opacity > 0) {

      opacity -= 0.1;

      element.style.opacity = opacity;

    }

    else {

      clearInterval(timer);

      element.remove();

    }

  }, duration);

}

/** ------ [BUILD] ------ **/

async function buildList(config, container , gui = getElement('#list-gui')) {

  let spinner = generateSpinner(true);

  if (container.innerHTML !== spinner) container.innerHTML = spinner;

  config.type = config.type || ''; // asset | binary | link | locked | subscriber
  //config.list []
  //config.page {}
  config.empty_text = config.empty_text || 'None found';
  config.edit_mode = config.edit_mode || false; // edit mode


  if (!config.list) {

    if (config.type === 'asset' && config.page) return getAssets(config.page)

      .then(assets => {

        config.list = assets || [];

        config.empty_text = 'No assets found';

        return buildList(config, container, gui);

      });

    if (config.type === 'binary' && config.page) return getBinaryFiles(config.page)

      .then(files => {

        config.list = files || [];

        config.empty_text = 'No binary files found';

        return buildList(config, container, gui);

      });

    if (config.type === 'link' && config.page) return getPageContentLinks(config.page)

      .then(links => {

        config.list = links || [];

        config.empty_text = 'No content links found';

        return buildList(config, container, gui);

      });

    if (config.type === 'locked') return getLockedFiles()

      .then(files => {

        config.list = files || [];

        config.empty_text = 'No locked files found';

        return buildList(config, container, gui);

      });

    if (config.type === 'subscriber' && config.page) return getSubscribers(config.page)

      .then(subscribers => {

        config.list = subscribers || [];

        config.empty_text = 'No subscribers found';

        return buildList(config, container, gui);

      });

    return;

  }

  else { // if (config.list)

    container.innerHTML = (config.list.length === 0) ? `<div class="text-secondary px-1 py-2">${config.empty_text}</div>` : '';

    if (gui) gui.classList.remove('d-none');

    if (container.childNodes.length === 0) container.appendChild(generateList(config.list, config.edit_mode));

    return;

  }

  return;

}

/** ------ [COLLECT] ------**/

async function collectDirectoryInfo(directory) {

  return api.files_list({site : directory.site, path : directory.path})

    .then(data => {

      log('directory files_list', data);

      //directory.entries = data.entries;

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

      directory.dm_tag = data.dm_tag;

      directory.http_path = data.http_path;

      return directory;

    });

}

async function collectDirectorySettings(directory) {

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

return api.files_list({site : page.site, path : page.path})

    .then(data => {

      page.dm_tag = data.entries[0].dm_tag;
      page.no_publish = data.entries[0].no_publish;
      page.locked_by = data.entries[0].locked_by;

      return page;

    });

}

async function collectPageProperties(page) {

return api.files_properties({site : page.site, path : page.path})

    .then(data => {

      log('page properties', data);

      page.title = data.title;
      page.description = data.meta_tags.find(item => item.name === 'Description').content;
      page.keywords = data.meta_tags.find(item => item.name === 'Keywords').content;
      page.heading = data.parameters.find(item => item.name === 'heading').value;
      page.breadcrumb = data.parameters.find(item => item.name === 'breadcrumb').value;
      page.parameters = data.parameters;
      page.meta_tags = data.meta_tags;
      page.tags = data.tags;

      return page;

    });

}

async function collectFileSource(file) {

  return api.files_source({site : file.site, path : file.path})

    .then(data => {

      file.source = data.source;

      return file;

    });

}

async function collectFilesSources(files) {

  let promises = [];

  for (let file of files) promises.push(collectFileSource(file));

  return Promise.all(promises)

    .then(results => files);

}

async function collectTargets(view) {

  return getTargets(view.site)

    .then(targets => {

      view.targets = targets;

      for (let target of targets) if (target.includes('-staging')) view.staging_target = target;

      return view;

    });

}

/** ------ [CREATE] ------ **/

async function createDirectory(name, site, path,  config = {}) {

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

  return tag.replace(/\{/g, '\\{').replace(/\}/g, '\\}');

}

/** ------ [FIND] ------ **/

async function findText(siteName, paths = ['/'], text) {

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

  let container = document.createElement('div');

  let closeButton = `<button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span></button>`;

  if (type === '') type = 'primary';

  container.classList.add('alert', `alert-${type}`, 'alert-dismissible', 'mb-2');
  container.setAttribute('role', 'alert');

  container.innerHTML = `<p class="mb-0">${message}</p>${closeButton}`;

  return container;
}

function generateBreadcrumb(view) {

  let container = document.createElement('div');

  //container.dataset.toggle = 'tooltip';
  //container.dataset.html = true;

  let breadcrumb = document.createElement('ol');

  breadcrumb.classList.add('breadcrumb', 'mb-2', 'p-2');

  container.appendChild(breadcrumb);

  let iconName = 

    (view.type === 'dashboard') ? 'home' :

    (view.type === 'directory') ? 'folder' :

    (view.type === 'file' && view.filetype === 'doc') ? 'docs' :

    (view.type === 'file' && view.filetype === 'img') ? 'image' :

    (view.type === 'file') ? 'attachment' :

    (view.type === 'page') ? 'draft' :

    (view.type === 'report') ? 'search' :

    'location_on';

  let tooltip = `<span class='material-symbols-outlined filled mr-1'>${iconName}</span>Current ${view.type === 'other' ? 'location' : view.type}`;

  let icon = `<span class="material-symbols-outlined filled text-muted mr-1">${iconName}</span>`

  let refresh = `<a href="#" class="text-secondary mr-1" data-toggle="tooltip" title="Refresh" onclick="reloadGadget()"><span class="material-symbols-outlined">refresh</span></a>`;

  breadcrumb.innerHTML = `<li>${icon}${refresh}</li>`;

  breadcrumb.appendChild(generateCrumb(view.site, `/browse/staging`, view.path === '/'));

  if (view.type === 'dashboard') breadcrumb.appendChild(generateCrumb('dashboard', ``, true));

  let crumbs = view.path.split('/');

  let trail = '';

  for (let crumb of crumbs) {

    if (crumb.length === 0) continue;

    trail += `/${crumb}`;

    let location = `/browse/staging${trail}`;

    let isLast = crumb === crumbs[crumbs.length - 1];

    breadcrumb.appendChild(generateCrumb(crumb, location, isLast, `${isLast ? tooltip : ''}`));

  }
  
  return container;

}

function generateCSV(data) {

  let content = 'data:text/csv;charset=utf-8,';

  for (let row of data) content += `${row.join()}\r\n`;

  return encodeURI(content).replace(/#/g, '%23');
}

function generateCrumb(text, location = '', isLast = false, tooltip = '') {

  let container = document.createElement('li');

  container.classList.add('breadcrumb-item');

  if (isLast) container.classList.add('active');

  container.innerHTML = (!isLast) ? `<a href="#">${text}</a>` : `${text}`;

  container.dataset.toggle = 'tooltip';
  container.dataset.html = true;
  container.title = tooltip;

  if (!isLast) container.querySelector('a').onclick = () => setLocation(location);

  return container;

}

function generatePageAccordion(pages = [], heading, checkboxes = false) {

  let container = document.createElement('div');

  let name = heading.replace(/\s+/, '-');

  container.id = `${name}-accordion`;

  let button = `<button class="btn btn-info btn-block text-left" data-toggle="collapse" data-target="#${name}-collapse-list">${name}<span class="float-right">${pages.length}</span></button>`;

  container.innerHTML = `${button}`;

  let listContainer = document.createElement('ul');

  container.appendChild(listContainer);

  listContainer.id = `${name}-collapse-list`;
  listContainer.classList.add('list-group', 'list-group-flush', 'collapse');

  if (pages.length === 0) return container; // early return if no pages

  for (let page of pages) listContainer.appendChild(generatePageListItem(page, checkboxes));

  return container;
  
}

function generatePageListItem(page, checkbox = false) {

  const CMS_URL_PRE = `${gadget.apihost}/11/#${gadget.skin}/${gadget.account}`;

  let container = document.createElement('li');

  container.classList.add('list-group-item', 'list-group-item-action', 'd-flex', 'px-1');
  
  let icon = `<span class="material-symbols-outlined text-info align-self-center ml-1">open_in_new</span>`;

  let input = (checkbox) ? `<input class="mr-1" data-site="${page.site}" data-path="${page.path}" value="${page.site},${page.path}" type="checkbox"/> ` : '';

  let link = `<a class="text-reset flex-fill" href="${CMS_URL_PRE}/${page.site}/preview${page.path}" target="_blank"><span class="badge badge-pill badge-info">${page.site}</span><br>${page.path}</a>`;

  container.innerHTML = `${input}${link}${icon}`;

  return container;

}

function generateList(list = [], checkboxes = false) {

  if (list.length === 0) return; // early return if empty list

  let container = document.createElement('ul');

  container.classList.add('list-group', 'list-group-flush');

  for (let item of list) container.appendChild(generateListItem(item, checkboxes));

  return container;

}

function generateListItem(item, checkbox = false) {

  const CMS_URL_PRE = `${gadget.apihost}/11/#${gadget.skin}/${gadget.account}`;

  let container = document.createElement('li');

  container.classList.add('list-group-item', 'list-group-item-action', 'd-flex', 'px-1', 'py-2');

  let icon = '';
  let input = '';
  let content = '';

  if (item.type === '') {

    if (checkbox) input = `<input class="mr-1" value="${item}" type="checkbox"/>`;

    content = `${item}`;

  }

  if (item.type === 'asset') {

    if (checkbox) input = `<input class="mr-1" data-site="${item.site}" data-path="${item.path}" data-name="${item.name}" data-type="asset" value="${item.site},${item.path}" type="checkbox"/>`;

    if (checkbox) input = `<input class="mr-1" type="checkbox"/>`;

    icon = `<span class="material-symbols-outlined text-info align-self-center mr-2">summarize</span>`;

    content = `<a class="text-reset flex-fill text-break" href="${CMS_URL_PRE}/${item.site}/preview${item.path}" target="_blank"><span class="badge badge-pill badge-info">${item.site}</span><br>${item.name}</a>`;

  }

  if (item.type === 'binary') {

    if (checkbox) input = `<input class="mr-1" data-site="${item.site}" data-path="${item.path}" data-type="binary" value="${item.site},${item.path}" type="checkbox"/>`;

    icon = `<span class="material-symbols-outlined text-info align-self-center mr-2">attachment</span>`;

    let badge = `<span class="badge badge-pill badge-info mr-1">${item.site}</span>`;

    badge += `<span class="badge badge-pill badge-secondary mr-1">${item.path.split('.').pop()}</span>`;

    content = `<a class="text-reset flex-fill text-break" href="${CMS_URL_PRE}/${item.site}/preview${item.path}" target="_blank">${badge}<br>${item.path}</a>`;
  }

  if (item.type === 'page') {

    icon = `<span class="material-symbols-outlined text-info align-self-center mr-2">draft</span>`;

    if (checkbox) input = `<input class="mr-1" data-site="${item.site}" data-path="${item.path}" data-type="page" value="${item.site},${item.path}" type="checkbox"/>`;

  content = `<a class="text-reset flex-fill text-break" href="${CMS_URL_PRE}/${item.site}/preview${item.path}" target="_blank"><span class="badge badge-pill badge-info">${item.site}</span><br>${item.path}</a>`;

  }

  if (item.type === 'link') {

    if (checkbox) input = `<input class="mr-1" data-link="${item.href}" data-link-text="${item.text}" data-type="link" value="${item.href}" type="checkbox"/>`;

    icon = `<span class="material-symbols-outlined text-info align-self-center mr-2">link</span>`;
	  
	let displayUrl = item.href.replace(/^https?:\/\//, '');

    let badge = '';

    if (item.href.startsWith('https')) badge = `<span class="badge badge-pill badge-info mr-1">https</span>`;

    else if (item.href.startsWith('http')) badge = `<span class="badge badge-pill badge-warning mr-1">http</span>`;

	if (item.href.includes('#')){

      badge += `<span class="badge badge-pill badge-dark mr-1">#${item.href.split('#').pop()}</span>`;
		
	}
	
	if (item.href.includes('a.cms.omniupdate.com')){

      badge = `<span class="badge badge-pill badge-danger mr-1">linked image</span>`;

	}

    if (item.href.startsWith('mailto:')) {

      badge = `<span class="badge badge-pill badge-info">mailto</span>`;

    }

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

    // phone number regex
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

    content = `<div class="flex-fill">`;

    content += `${badge}${(badge !== '') ? '<br>' : ''}`;

    content += `<span class="font-weight-bold">${item.text}</span><br>`;

    content += `<a class="text-muted text-break" href="${item.href}" target="_blank">${displayUrl}</a>`;

    content += `</div>`;

  }

  if (item.type === 'user') {

    if (checkbox) input = `<input class="mr-1" data-user="${item.username}" value="${item.username}" type="checkbox"/>`;

    icon = `<span class="material-symbols-outlined filled text-info align-self-center mr-2">person</span>`;

    content = `<a class="text-reset flex-fill text-break" href="${CMS_URL_PRE}/${gadget.site}/setup/users/${item.username}" target="_blank">${item.reverse_name}<br><span class="badge badge-pill badge-info">${item.username}</span></a>`;

  }

  container.innerHTML = `${input}${icon}${content}`;

  return container;

}

function generateSpinner(asString = false) {

  let container = document.createElement('div');

  container.classList.add('spinner-border', 'spinner-border-sm', 'spinner-grow-sm');
  container.setAttribute('role', 'status');
  container.innerHTML = '<span class="sr-only">Loading...</span>';

  return (!asString) ? container : container.outerHTML;

}

function generateModal(title, body, closeText = 'Close') {

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
          <button type="button" class="btn btn-outline-secondary" data-dismiss="modal">${closeText}</button>
        </div>
      </div>
    </div>
  `;

  return container;

}

function generateConfirmModal(title, body, confirmText, denyText) {

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

  let proms = [];

  let zipper = new zip.ZipWriter(new zip.BlobWriter('application/zip'));

  for (let file of files) {

    let filepath = file.path.slice(startingDirectory.length + 1);
	  
    if (file.source) proms.push(zipper.add(filepath, new zip.TextReader(file.source)));

  }

  proms.push(zipper.close());
  
  return Promise.all(proms)

    .then(blob => URL.createObjectURL(blob.pop()));

}

/** -------- [GET] -------- **/

/** ---- [GET ACCESS] ---- **/

async function getAccessGroups() {

  return api.reports_custom({report : 'groups', g_memberlist: 'on'})

    .then(report => {

      let groups = {};

      for (let entry of report.records) groups[entry.g_name] = (entry.g_memberlist === 'N/A') ? [] : entry.g_memberlist.split(', ');

      return groups;

    });

}

/** ---- [GET ASSETS] ---- **/

async function getAssets(page) {

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

      return data;

    });

}

/** ---- [GET BINARY FILES] ---- **/

async function getBinaryFiles(page) {

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

  return api.components_list();

}

async function getComponentDependents(name) {

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

  return gadget.getFileInfo()

    .then(data => {

      if (!data) return data;

      log('file info', data);

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

  return gadget.getLocation()

    .then(location => {

      let view = { site : gadget.site };

      let hash = location.hash;

      let hashBase = `#${gadget.skin}/${gadget.account}/${gadget.site}`;

      let directoryHash = `${hashBase}/browse/staging`;

      if (hash.startsWith(directoryHash)) {

        view.path = (hash === directoryHash) ? '/' : hash.replace(directoryHash, '');
        view.type = 'directory';

      }

      if (hash.replace(/\/$/, '') === hashBase) {

        view.path = '';
        view.type = 'dashboard';

      }

      if (hash.startsWith(`${hashBase}/reports`)) {

        view.path = hash.replace(hashBase, '');
        view.type = 'report';

      }

      if (!view.type) {

        view.path = hash.replace(hashBase, '');
        view.type = 'other';

      }

      return view;

    });

}

async function getCurrentView() {

  return getCurrentFile()

    .then(file => {

      return (file) ? file : getCurrentLocation();

    });

}


/** ------ [GET TAG] ------ **/

async function getDependencyTag(page) {

  return api.files_list({site : page.site, path : page.path})

    .then(data => data.entries[0].dm_tag);

}

async function getDirectoryDmTag(directory) {

  return api.files_list({site : directory.site, path : directory.path})

    .then(data => data.dm_tag);

}

async function getDmTagByUrl(url) {

  if (url.startsWith('http://')) url = url.replace('http://', 'https://');

  if (!url.startsWith('http')) url = `https://${url}`;

  let urlObj = new URL(url);

  let path = '';
  
  let parts = urlObj.pathname.split('/').filter(item => item);

  let site = await getSiteByDomain(urlObj.hostname);

  for (let part of parts) {

    if (part.includes('.')) part = part.replace(/\.(htm|aspx)$/i, '.pcf');

    let entry = await getDirectoryEntry({site : site, path : path} , part);

    part = entry.file_name;

    path += `/${part}`;

  }

  if (parts.length === 0) path = '/default.htm';

  if (!path.includes('.')) path += '/default.htm';

  return getDependencyTag({ site : site, path : path });

}

/** ------ [GET DIRECTORY] ------ **/

async function getDirectories(directory, includeSubdirs = false, filters = []) {

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

        if (!includeSubdirs) if (entry.d_address !== startPath) return false;

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

            let subpath = entry.pd_address.replace(directory.path, '');

            if (subpath.split('/').length > 2) return false;

          }

          if (['/_navigation/', '/_resources/', '/bin/', ...filters].some(value => entry.pd_address.includes(value))) return false; // ignore folders check

          return true;

        })

        .map(entry => ({

          site : gadget.site,
          path : entry.pd_address,
          dm_tag : entry.pd_dtag,
          access : entry.pd_access,
          filename : entry.pd_filename,
          http_path : `${gadget.site}${entry.pd_address.replace(entry.pd_address.split('/').pop(), entry.pd_filename)}`,
          type : (entry.pd_address.includes('.pcf')) ? 'page' : 'file',

        })));

}

async function getDirectoryEntries(directory) {

  return api.files_list({ site : directory.site, path : directory.path })

    .then(data => data.entries);

}

async function getDirectoryEntry(directory, name) {

  return getDirectoryEntries(directory)

    .then(entries => {

      for (let entry of entries) {

        if (entry.file_name.toLowerCase() === name.toLowerCase()) return entry;

      }

      return;

    });

}

async function getDirectorySettings(directory) {

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

  return document.querySelector(query);

}

function getElementText(element) {

  let text = '';

  for (let node of element.childNodes) if (node.nodeType === Node.TEXT_NODE) text += node.textContent;

  return text;

}

function getElements(query) {

  let list = document.querySelectorAll(query);

  return (list.length === 0) ? null : list;

}

/** ------ [GET FIND RESULTS] ------ **/

async function getFindReplaceResults(id, site) {

  await new Promise(resolve => setTimeout(resolve, 1000));

  return api.sites_findreplacestatus({id : id, site : site})

    .then(results => (results.finished) ? results : 

      getFindReplaceResults(id, site));

}

async function getLatestVersion(file) {

  return api.files_versions({site : file.site, path : file.path})

    .then(versions => (!versions[0]) ? 0 : versions[0].revision);

}

async function getLockedFiles() {

  return getSites(false)

    .then(sites => {

      let promises = [];

      for (let site of sites) promises.push(api.files_locked({site : site.name})

        .then(data => {

          return data.filter(entry => {

            if (entry.type === 'asset') return false; // ignore assets for now

            if (entry.path.includes('/recycle_bin')) return false; // ignore recycled files

            entry.site = site.name;

            if (entry.type === 'img' || entry.type === 'doc') entry.type = 'binary';

            if (entry.type === 'pcf' || entry.type === 'txt' || entry.type === 'html') entry.type = 'page';

            return true;

          });

        }));

      return Promise.all(promises)

        .then(results => results.flat());

    });

}

/** ------ [GET PAGE] ------ **/

async function getPageContent(page, labels = []) {

  if (labels.length === 0) return api.files_content({site : page.site, path : page.path});

  let promises = [];

  for (let label of labels) promises.push(api.files_content({site : page.site, path : page.path, label : label}));

  return Promise.all(promises)

    .then(results => results.flat());

}

async function getPageContentLinks(page) {
	
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

  let config = {

    site : page.site,
    path : page.path,

  };

  if (label != '') config.label = label;

  return api.files_source(config)

    .then(data => data.source);

}

async function getPageUrl(page) {

  return api.files_list({site : page.site, path : page.path})

    .then(data => data.entries[0].http_path);

}

async function getPublishingStatus(page) {

  return api.files_settings({site : page.site, path : page.path})

    .then(data => data.no_publish);

}

/** ------ [GET SITE] ------ **/

async function getSiteByDomain(domain) {

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

  return api.sites_list()

    .then(list => {

      if (excludeDevSites) list.filter((entry) => !DEV_SITES.includes(entry.site));

      return list.map((entry) => entry.site);

    });

}

async function getSites(excludeDevSites = true) {

  return api.reports_custom({site : gadget.site, report : 'sites', s_serverpath : 'on'})

    .then(report => {

      return report.records

        .filter((entry) => !(excludeDevSites && DEV_SITES.includes(entry.s_name)))

        .filter((entry) => entry.s_name === entry.s_targetname)

        .map((entry) => ({name : entry.s_name, http_path : entry.s_serverpath.replace(/\/$/, '')}));

    });

}

/** ------ [GET SUBSCRIBERS] ------ **/

async function getSubscribers(page) {

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

  return getTargets(site).then(targets => {

      for (let target of targets) if (target.includes('-staging')) return target;

      return;

    });

}

async function getTargets(site) {

  return api.sites_targets({site : site})

    .then(data => data.targets);

}


/** ------ [GET TODAY] ------ **/
/**
 * Returns today as a date string in the format of [YYYY-MM-DD].
 *
 * @returns {string}
 */
function getToday() {

  return new Date().toLocaleDateString('en-CA');

}

/** ------ [GET USER] ------ **/

async function getUser(username = '') {

  if (!!username) return api.users_view();

  return api.users_view({user : username});

}

async function getUsers() {

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

  return array.reduce((acc, entry) => { // acc = accumulator

    let key = entry[property];

    if (!acc[key]) acc[key] = [];

    acc[key].push(entry);

    return acc;

  }, {});

}

/* -------- [INIT] -------- */

async function initTooltips() {

  let old = getElement('.tooltip.fade.show');

  if (old) old.remove();

  $('[data-toggle="tooltip"]:not([data-original-title])').tooltip({container : 'body', trigger : 'hover'});

}

/** ------ [LOAD] ------ **/

async function loadBreadcrumb(view) {

  let container = getElement('#breadcrumb');

  container.innerHTML = '';

  return container.appendChild(generateBreadcrumb(view));

}

/** ------ [LOG] ------ **/

function log(text, value) {

  if (api.logging) console.log(`[${api.name}] ${text} : `, value);

}

/* -------- [PUBLISH][UNPUBLISH] -------- */

async function publishPage(page, target = '', override = false) {

  let config = {site : page.site, path : page.path};

  if (target !== '') config.target = target;

  if (override) config.override = true;

  return api.files_publish(config);

}

async function publishPageFull(page) {

  let promises = [];

  if (!page.targets) page.targets = await getTargets(page.site);

  for (let target of page.targets) promises.push(publishPage(page, target, true));

  return Promise.all(promises);

}

async function unpublishPage(page, target = '') {

  let config = {

    site : page.site,
    path : page.path,
    remote : true,

  };

  if (target !== '') config.target = target;

  return api.files_delete(config);

}

/** ------ [REMOVE] ------ **/

/** ------ [REPLACE] ------ **/

async function replaceText(siteName, paths = ['/'], text = '', replacement = '') {

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

  let promises = [];

  let filtered = directories.filter(entry => entry.access !== access);

  for (let directory of filtered) promises.push(setDirectorySettings(directory, {access : access}));

  return Promise.all(promises)

    .then(results => ({

      updated : results.length,
      verified : (directories.length - results.length),

    }));

}

async function setDirectoriesExtensions(directories, extensions) {

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

      for (let key of Object.keys(data.variables)) config['_'+key] = data.variables[key];

      for (let key of Object.keys(settings)) config[key] = settings[key];

      if (settings.variables) for (let key of Object.keys(settings.variables)) config['_'+key] = settings.variables[key];

      return api.directories_settings(config, 'POST');

    });

}

async function setFileSettings(file, settings = {}) {

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
        no_publish : !data.no_publish,
        no_search : data.no_search,
        no_sitemap : data.no_sitemap,
        page_forwarding : data.page_forwarding,
        publishers : data.publishers,
        toolbar : data.toolbar,
        tracking_enabled : data.tracking_enabled,
        url_type : data.url_type,

      };

      for (let key of Object.keys(config)) if (!config[key]) delete config[key]; // remove falsy entries

      for (let key of Object.keys(settings)) config[key] = settings[key];

      return api.files_settings(config, 'POST');

    });

}

async function setFilesAccess(files, access) {

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

  return gadget.setLocation(location);

}


async function setView(view) {

  if (gadget.site !== view.site) return;

  let location = (['document', 'file', 'image', 'page'].includes(view.type)) ? `/preview${view.path}` :

    (view.type === 'directory') ? `/browse/staging${view.path}` :

    view.path;

  return setLocation(location);

}

/* -------- [SORT] -------- */

/**
 * Sorts an array of objects by a key-value pair of each object.
 * @param arr The array to sort.
 * @param sortKey The key pair used to sort the objects by.
 * @returns {Array} Sorted array.
 */
function sortObjs(arr, sortKey) {
  if (arr.length === 0) return [];
  let sorted = [];

  for (let item of arr) {
    for (let i = 0; i <= arr.length; i++) {
      if (sorted.length === i) {
        sorted.push(item);
        break;
      } else if (typeof item[sortKey] === 'string') {
        if (item[sortKey].localeCompare(sorted[i][sortKey]) === -1) {
          sorted.splice(i, 0, item);
          break;
        }
      } else if (item[sortKey] < sorted[i][sortKey]) {
        sorted.splice(i, 0, item);
        break;
      }
    }
  }
  return sorted;
}

function sortUsersByCase(a, b) {

  let nameA = a.reverse_name;
  let nameB = b.reverse_name;

  if (nameA.toLowerCase() < nameB.toLowerCase()) return -1;

  if (nameA.toLowerCase() > nameB.toLowerCase()) return 1;

  if (nameA < nameB) return -1;

  if (nameA > nameB) return 1;

  return 0;

}

/** -------- [TOGGLE] -------- **/

/**
 * Toggles between #loading panel and #main panel.
 */
async function toggleLoading() {

  getElement('#loading').classList.toggle('d-none');
  getElement('#main').classList.toggle('d-none');

}

/** ------ [UNLOCK] ------ **/

async function unlockFile(file) {

  return api.files_checkin({site : file.site, path : file.path, override : true});

}

async function unlockFiles(files) {

  let promises = [];

  for (let file of files) promises.push(unlockFile(file));

  return Promise.all(promises);

}
