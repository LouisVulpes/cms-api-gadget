/**
 * cms-api.js
 *
 * @author Louis Vulpes	
 * @copyright Missouri State University 2024-2026
 */


class CmsApi {

/**
 * CmsApi
 * Thin wrapper around the OU Campus CMS API using jQuery.ajax.
 *
 * Assumes a global `gadget` object is available (token, apihost, account, site, etc).
 * Also assumes jQuery `$` is available.
 */

  constructor() {

    // Identify the gadget instance (name or gid) and CMS context.
    this.name = gadget.name || gadget.gid || '';
    this.site = gadget.site || '';

    // Base API host (defaults to OU's CMS host).
    this.apihost = gadget.apihost || 'https://a.cms.omniupdate.com';

    // OU Campus account + skin are used to build the base admin URL.
    this.account = gadget.account || 'missouristate';
    this.skin = gadget.skin || 'oucampus';

    // Hostbase appears to be a UI base route (OU Campus "11" interface deep link).
    this.hostbase = gadget.hostbase || `/11/#${this.skin}/${this.account}/${this.site}`;

    // Helpful for logging / diagnostics.
    this.user = gadget.user || 'unknown user';

  }


  get(endpoint, data, retries = 3) {

  /**
   * Convenience GET wrapper.
   * @param {string} endpoint - API path (e.g. "/api/...").
   * @param {object} data - Query params.
   * @param {number} retries - Optional retry limit override.
   */

    let config = { method : 'GET', endpoint, data, retries };

    return this.call(config);

  }


  post(endpoint, data, retries = 3) {

  /**
   * Convenience POST wrapper.
   * @param {string} endpoint - API path (e.g. "/api/...").
   * @param {object} data - Body/query params (jQuery will form-encode).
   * @param {number} retries - Optional retry limit override.
   */

    let config = { method : 'POST', endpoint, data, retries };

    return this.call(config);

  }

  call(config) {

  /**
   * Core request handler with retry + exponential backoff.
   * @param {object} config
   * @param {'GET'|'POST'} config.method
   * @param {string} config.endpoint
   * @param {object} [config.data]
   * @param {number} [config.retries] - max retry attempts (default 3)
   * @param {number} [config.delay] - base delay for backoff (default 1000ms)
   * @returns {Promise<any>}
   */

    // If caller didn't set retries, default to 3.
    let retries = config.retries ?? 3;

    // Base delay for exponential backoff.
    let delay = config.delay ?? 1000;

    config.data = config.data || {};

    // OU Campus commonly accepts the auth token in both header and params.
    config.data.authorization_token = gadget.token;

    const backoff = (attempt) => {

    /**
     * Exponential backoff with jitter:
     * attempt 0 => ~delay
     * attempt 1 => ~2*delay
     * attempt 2 => ~4*delay
     * capped at 15s
     */

      const base = delay * Math.pow(2, attempt);

      const jitter = Math.floor(Math.random() * 250); 

      return Math.min(base + jitter, 15_000);

    };

    // Error codes safe to retry.
    // NOTE: Only retries on "TIMEOUT" currently.
    let retryCodes = ['TIMEOUT'];

    return new Promise((resolve, reject) => {

      function ring(count) {

      /**
       * Attempts the request. If retriable failure and under max attempts,
       * it schedules another attempt with backoff delay.
       *
       * @param {number} count - attempt number starting at 0
       */

        $.ajax({

          type : config.method,
          url : `${gadget.apihost}${config.endpoint}`,

          // $.param(config.data, true) uses "traditional" param serialization when true.
          // This is important when sending arrays / nested objects.
          data : $.param(config.data, true),

          // Token also sent as a header; typical OU Campus pattern.
          headers : { 'X-Auth-Token' : gadget.token },

        })

          // On success, resolve the promise with the AJAX response.
          .done(resolve)

          // On failure, inspect response and decide whether to retry.
          .fail((jqXHR, status, error) => {

            let response = jqXHR.responseJSON;

            let retriable = false;

            // Styled logging to make these errors easy to spot in devtools.
            let style = 'color: firebrick; font-weight: bold;';

            console.log('%c====== CMS API ERROR ======', style);
            console.log('%c    Method : ', style, config.method);
            console.log('%c  Endpoint : ', style, config.endpoint);
            console.log('%cParameters : ', style, config.data);

            if (!response) console.log('%cNo response JSON provided by the error.', style);

            else {

              console.log('%c      Code : ', style, response.code);
              console.log('%c   Message : ', style, response.error);

              // Decide whether this error is retriable based on code tokens.
              retriable = retryCodes.some(token => typeof response.code === 'string' && response.code.includes(token));


              // Special-case: session invalid or missing.
              // Replace page content with a simple recovery instruction.
              if (response.code === 'SESSION_NOT_FOUND') {

                document.body.innerHTML = '<h3>Failed to connect</h3><p>Reload the page.</p>';

              }

            }

            // Retry if allowed and under retry count; otherwise reject.
            if (retriable && count < retries) setTimeout(() => ring(count + 1), backoff(count));

            else reject({ jqXHR, status, error });

          });

      }

      ring(0); // Start the first attempt immediately.

    });

  }

  // ========== ENDPOINTS ==========

  // ========== [/assets] ==========

  /**
   * Calls the [/assets/list] endpoint
   *
   * List a page of assets. (All user levels)
   */
  assets_list(config = {}) {
    if (!config.site) config.site = this.site;
    return this.get('/assets/list', config);
  }

  /**
   * Calls the [/assets/view] endpoint
   *
   * View an asset. (All user levels)
   */
  assets_view(config = {}) {
    if (!config.site) config.site = this.site;
    return this.get('/assets/view', config);
  }

  // ========== [/components] ==========

  /**
   * Calls the [/rs/components/dependents/{type}/{name}] endpoint
   *
   * Get dependent pages for a given component.
   */
  components_dependents(config = {}) {
    if (!config.type) config.type = 'generic';
    return this.get(`/rs/components/dependents/${config.type}/${config.name}`, config);
  }

  /**
   * Calls the [/rs/components/{type}/{name}] endpoint
   *
   * Get a component.
   */
  components_get(config = {}) {
    if (!config.type) config.type = 'generic';
    return this.get(`/rs/components/${config.type}/${config.name}`, config);
  }

  /**
   * Calls the [/rs/components] endpoint
   *
   * Get components.
   */
  components_list(config = {}) {
    if (!config.type) config.type = 'generic';
    if (config.disabled === undefined) config.disabled = false;
    return this.get('/rs/components', config);
  }

  // ========== [/directories] ==========

  /**
   * Calls the [/directories/settings] endpoint
   *
   * GET : Get directory settings. (All user levels)
   *
   * POST : Save directory settings. (Level 4+ with permission to write to the directory)
   */
  directories_settings(config = {}, method = 'GET') {
    if (!config.site) config.site = this.site;
    if (method === 'POST') return this.post('/directories/settings', config);
    return this.get('/directories/settings', config);
  }

  // ========== /files ==========

  /**
   * Calls the [/files/backup] endpoint
   *
   * Backup a file to the versioning system. (Level 9+ or have group access)
   */
  files_backup(config = {}) {
    if (!config.site) config.site = this.site;
    if (!config.message) config.message = 'Backup via CMS API';
    return this.post('/files/backup', config);
  }

  /**
   * Calls the [/files/brokenpages] endpoint
   *
   * Get broken pages. (All user levels)
   */
  files_brokenpages(config = {}) {
    if (!config.site) config.site = this.site;
    return this.get('/files/brokenpages', config);
  }

  /**
   * Calls the [/files/checkedout] endpoint
   *
   * Get checked out pages. (All user levels)
   */
  files_checkedout(config = {}) {
    if (config.all === undefined) config.all = true;
    if (!config.site) config.site = this.site;
    return this.get('/files/checkedout', config);
  }

  /**
   * Calls the [/files/checkin] endpoint
   *
   * Checkin a file. (Level 9+ or have group access)
   */
  files_checkin(config = {}) {
    if (!config.site) config.site = this.site;
    return this.post('/files/checkin', config);
  }

  /**
   * Calls the [/files/checkout] endpoint
   *
   * Checkout a file. (Level 9+ or have group access)
   */
  files_checkout(config = {}) {
    if (!config.site) config.site = this.site;
    return this.post('/files/checkout', config);
  }

  /**
   * Calls the [/files/content] endpoint.
   *
   * Get file content. (Level 9+ or 1+ with source permissions and group access)
   */
  files_content(config = {}) {
    if (!config.site) config.site = this.site;
    return this.get('/files/content', config);
  }

  /**
   * Calls the [/files/copy] endpoint.
   *
   * Copy a file to a new destination. (Level 9+ or level 8+ with group access to the source and destination.)
   */
  files_copy(config = {}, retries = 0) {
    if (!config.site) config.site = this.site;
    return this.post('/files/copy', config, retries);
  }

  /**
   * Calls the [/files/delete] endpoint.
   *
   * Delete one or more files. (Level 8+ with group access or 1+ with delete permissions and group access)
   */
  files_delete(config = {}) {
    if (!config.site) config.site = this.site;
    return this.post('/files/delete', config);
  }

  /**
   * Calls the [/files/dependencies] endpoint.
   *
   * Get dependencies. (All user levels)
   */
  files_dependencies(config = {}) {
    if (!config.site) config.site = this.site;
    return this.get('/files/dependencies', config);
  }

  /**
   * Calls the [/files/dependency] endpoint.
   *
   * Get dependency manager tag info. (All user levels)
   */
  files_dependency(config = {}) {
    if (!config.site) config.site = this.site;
    return this.get('/files/dependency', config);
  }

  /**
   * Calls the [/files/dependents] endpoint.
   *
   * Returns a list of pages on staging that are dependent on the specified files. (All user levels)
   */
  files_dependents(config = {}) {
    if (!config.site) config.site = this.site;
    return this.get('/files/dependents', config);
  }

  /**
   * Calls the [/files/dirtypages] endpoint.
   *
   * Get dirty pages. (Level 9+ or have group access)
   */
  files_dirtypages(config = {}) {
    if (!config.site) config.site = this.site;
    return this.get('/files/dirtypages', config);
  }

  /**
   * Calls the [/files/dm_revert] endpoint.
   *
   * This action will remove all Dependency Manager tags from all staging files in the site directory specified, replacing them with URL type links. (All user levels)
   */
  files_dm_revert(config = {}) {
    if (!config.site) config.site = this.site;
    return this.post('/files/dm_revert', config);
  }

  /**
   * Calls the [/files/info] endpoint
   *
   * Returns file information for a specified file path. (Level 9+ or 5+ with group access)
   *
   * @param {Object} data Parameters for the API call.
   * @returns {*} Response from the CMS API.
   */
  files_info(config = {}) {
    if (!config.site) config.site = this.site;
    return this.get('/files/info', config);
  }

  /**
   * Calls the [/files/list] endpoint.
   *
   * Returns a list of files for a specified directory or .pcf path. (All user
   * levels)
   */
  files_list(config = {}) {
    if (!config.site) config.site = this.site;
    return this.get('/files/list', config);
  }


  /**
   * Calls the [/files/locked] endpoint
   *
   * Returns a list of files that the current user has locked. (All user levels)
   */
  files_locked(config = {}) {
    if (!config.site) config.site = this.site;
    return this.get('/files/locked', config);
  }

  /**
   * Calls the [/files/log] endpoint.
   *
   * Get file log info for a specified file. (All user levels)
   */
  files_log(config = {}) {
    if (!config.site) config.site = this.site;
    return this.get('/files/log', config);
  }

  /**
   * Calls the [/files/move] endpoint.
   *
   * Move a file. (Level 9+ or level 8+ with group access to the source and destination.)
   */
  files_move(config = {}) {
    if (!config.site) config.site = this.site;
    return this.post('/files/move', config);
  }

  /**
   * Calls the [/files/multipublish] endpoint.
   *
   * Publish all files in a directory or multiple individual files. (Level 9+ or publish target group access)
   */
  files_multipublish(config = {}) {
    if (!config.site) config.site = this.site;
    if (!config.target) config.target = config.site;

    let callConfig = {

      method : 'POST',
      endpoint : '/files/multipublish',
      data : config,

    }

    return this.call(callConfig);

  }

  /**
   * Calls the [/files/new_folder] endpoint.
   *
   * Creates a new directory (folder)
   * Returns an error if folder with name exists
   */
  files_new_folder(config = {}) {
    if (!config.site) config.site = this.site;
    return this.post('/files/new_folder', config);
  }

  /**
   * Calls the [/files/products] endpoint.
   *
   * Get page products. (All user levels)
   */
  files_products(config = {}) {
    if (!config.site) config.site = this.site;
    return this.get('/files/products', config);
  }

  /**
   * Calls the [/files/properties] endpoint
   *
   * GET : Get page properties. (Level 9+ or level 5+ with group access)
   *
   * POST : Save page properties. (Level 9+ or level 5+ with group access)
   */
  files_properties(config = {}, method = 'GET') {
    if (!config.site) config.site = this.site;
    if (method === 'POST') return this.post('/files/properties', config);
    return this.get('/files/properties', config);
  }

  /**
   * Calls the [/files/publish] endpoint.
   *
   * Publish a file. (Level 9+ or group access)
   */
  files_publish(config = {}) {
    if (!config.site) config.site = this.site;
    return this.post('/files/publish', config);
  }

  /**
   * Calls the [/files/recycle] endpoint.
   *
   * Send files to the recycle bin. (Level 9+ or 1+ with delete permissions and group access)
   */
  files_recycle(config = {}) {
    if (!config.site) config.site = this.site;
    return this.post('/files/recycle', config);
  }

  /**
   * Calls the [/files/rename] endpoint.
   *
   * Rename a file. (Level 9+ or 8 with group access)
   */
  files_rename(config = {}) {
    if (!config.site) config.site = this.site;
    return this.post('/files/rename', config);
  }

  /**
   * Calls the [/files/save] endpoint.
   *
   * Save files. (Level 9+ or 1+ with group access)
   */
  files_save(config = {}) {
    if (!config.site) config.site = this.site;
    return this.post('/files/save', config);
  }

  /**
   * Calls the [/files/scan] endpoint.
   *
   * Synchronizes the current staging files of a directory with the database. 
   */
  files_scan(config = {}) {
    if (!config.site) config.site = this.site;
    return this.post('/files/scan', config);
  }

  /**
   * Calls the [/files/settings] endpoint
   *
   * GET : Get page access settings. (All user levels)
   *
   * POST : Save page access settings. (Level 9+ or 1+ with group access)
   */
  files_settings(config = {}, method = 'GET') {
    if (!config.site) config.site = this.site;
    if (method === 'POST') return this.post('/files/settings', config);
    return this.get('/files/settings', config);
  }

  /**
   * Calls the [/files/source] endpoint.
   *
   * Get file source code. (Level 9+ or 1+ with source permissions and group access)
   */
  files_source(config = {}) {
    if (!config.site) config.site = this.site;
    if (config.brokentags === undefined) config.brokentags = true;
    return this.get('/files/source', config);
  }

  /**
   * Calls the [/files/subscribers] endpoint.
   *
   * Returns a list of files that are subscribers to a specified file. (All user levels)
   */
  files_subscribers(config = {}) {
    if (!config.site) config.site = this.site;
    return this.get('/files/subscribers', config);
  }

  /**
   * Calls the [/files/upload] endpoint.
   *
   * Returns a list of files that are subscribers to a specified file. (All user levels)
   *
   * @param {Object} data Parameters for the API call.
   * @returns {*} Response from the CMS API.
   */
  files_upload(config = {}) {
    if (!config.site) config.site = this.site;
    if (config.overwrite === undefined) config.overwrite = true;
    return this.post('/files/upload', config);
  }

  /**
   * Calls the [/files/versions] endpoint
   *
   * Returns a list of versions for a specified file. (Level 9+ or have group access)
   */
  files_versions(config = {}) {
    if (!config.site) config.site = this.site;
    return this.get('/files/versions', config);
  }

  /**
   * Calls the [/files/view] endpoint
   *
   * View a file. (Level 9+ or have group access)
   */
  files_view(config = {}) {
    if (!config.site) config.site = this.site;
    return this.get('/files/view', config);
  }

  /**
   * Calls the [/files/wysiwyg_info] endpoint
   *
   * Get WYSIWYG info. (Level 9+ or have group access)
   *
   * @param {Object} data Parameters for the API call.
   * @returns {*} Response from the CMS API.
   */
  files_wysiwyg_info(config = {}) {
    if (!config.site) config.site = this.site;
    return this.get('/files/wysiwyg_info', config);
  }


  // ========== /groups ==========

  /**
   * Calls the [/groups/list] endpoint
   *
   * Returns a list of group information. (All user levels)
   */
  groups_list(config = {}) {
    return this.get('/groups/list', config);
  }

  /**
   * Calls the [/groups/view] endpoint
   *
   * Returns group information for the specified group. (Level 10+ only)
   */
  groups_view(config = {}) {
    return this.get('/groups/view', config);
  }

  // ========== /reports ==========

  /**
   * Calls the [/reports] endpoint
   *
   * Custom reports. (Level 9+ only)
   */
  reports_custom(config = {}) {
    if (config.all === undefined) config.all = true;
    if (!config.site) config.site = this.site;
    return this.get('/reports', config);
  }

  /**
   * Calls the [/reports/subscribers] endpoint
   *
   * Get dependency tag subscribers. (Level 9+ only)
   */
  reports_subscribers(config = {}) {
    if (!config.site) config.site = this.site;
    return this.get('/reports/subscribers', config);
  }

  // ========== /sites ==========

  /**
   * Calls the [/sites/advanced_search] endpoint
   *
   * Advanced global search. (All user levels)
   */
  sites_advanced_search(config = {}) {
    if (!config.site) config.site = this.site;
    return this.get('/sites/advanced_search', config);
  }

  /**
   * Calls the [/sites/basic_search] endpoint
   *
   * Basic global search. (All user levels)
   */
  sites_basic_search(config = {}) {
    if (!config.site) config.site = this.site;
    return this.get('/sites/basic_search', config);
  }

  /**
   * Calls the [/sites/findreplace] endpoint
   *
   * Start a find and replace job. (Level 10+ only)
   */
  sites_findreplace(config = {}) {
    if (!config.site) config.site = this.site;
    return this.post('/sites/findreplace', config);
  }

  /**
   * Calls the [/sites/findreplacestatus] endpoint
   *
   * Returns find and replace status for a specified find and replace job. (Level 10+ only and must the owner of the find and replace job)
   */
  sites_findreplacestatus(config = {}) {
    if (!config.site) config.site = this.site;
    return this.get('/sites/findreplacestatus', config);
  }

  /**
   * Calls the [/sites/list] endpoint
   *
   * Returns a list of sites for an account. (All user levels)
   */
  sites_list(config = {}) {
    if (!config.account) config.account = this.account;
    return this.get('/sites/list', config);
  }

  /**
   * Calls the [/sites/publish] endpoint
   *
   * Publish an entire site. (Level 10+ only)
   */
  sites_publish(config = {}) {
    if (!config.site) config.site = this.site;
    return this.post('/sites/publish', config);
  }

  /**
   * Calls the [/sites/quicksearch] endpoint
   *
   * Quick Search. (All user levels)
   */
  sites_quicksearch(config = {}) {
    if (!config.site) config.site = this.site;
    if (!config.count) config.count = 1000;
    return this.get('/sites/quicksearch', config);
  }

  /**
   * Calls the [/sites/revert] endpoint
   *
   * This action will remove all Dependency Manager tags from all staging files on site, replacing them with URL type links. (Level 10+ only)
   */
  sites_revert(config = {}) {
    if (!config.site) config.site = this.site;
    return this.post('/sites/revert', config);
  }

  /**
   * Calls the [/sites/scan] endpoint
   *
   * Start a dependency manager scan on a site. (Level 10+ only)
   */
  sites_scan(config = {}) {
    if (!config.site) config.site = this.site;
    return this.get('/sites/scan', config);
  }

  /**
   * Calls the [/sites/sitemap] endpoint
   *
   * Generate and publish sitemap.xml to production. (Level 10+ only)
   */
  sites_sitemap(config = {}) {
    if (!config.site) config.site = this.site;
    return this.post('/sites/sitemap', config);
  }

  /**
   * Calls the [/sites/targets] endpoint
   *
   * Returns a list of publish target names for the specified site. (All user levels)
   */
  sites_targets(config = {}) {
    if (!config.site) config.site = this.site;
    return this.get('/sites/targets', config);
  }

  /**
   * Calls the [/sites/view] endpoint
   *
   * Returns site information for the specified site. (Level 10+ only)
   */
  sites_view(config = {}) {
    if (!config.account) config.account = this.account;
    if (!config.site) config.site = this.site;
    return this.get('/sites/view', config);
  }

  // ========== /tag ==========

  /**
   * Calls the [/tag/list] endpoint
   *
   * Fetch a list of tags. (All user levels)
   */
  tag_list(config = {}) {
    return this.get('/tag/list', config);
  }

  // ========== /users ==========

  /**
   * Calls the [/users/delete] endpoint
   *
   * Deletes one or more users in an account. (Level 10+ only)
   */
  users_delete(config = {}) {
    return this.post('/users/delete', config);
  }

  /**
   * Calls the [/users/groups] endpoint
   *
   * Returns user information for the specified user. If you are non-admin user, only your own user info gets returned. (All user levels)
   */
  users_groups(config = {}) {
    if (!config.user) config.user = this.user;
    return this.get('/users/groups', config);
  }

  /**
   * Calls the [/users/list] endpoint
   *
   * Returns a list of user information. (All user levels)
   */
  users_list(config = {}) {
    return this.get('/users/list', config);
  }

  /**
   * Calls the [/users/view] endpoint
   *
   * Returns user information for the specified user. If you are non-admin user, only your own user info gets returned. (All user levels)
   */
  users_view(config = {}) {
    if (!config.user) config.user = this.user;
    return this.get('/users/view', config);
  }
}
