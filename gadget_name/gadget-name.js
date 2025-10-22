/**
 * gadget-name.js
 */

var api; // {}

var current; // {}

var groups, users; // {}

$(() => gadget.ready(init));

/**
 * Runs on gadget load.
 */
function init() {

  api = new CmsApi();

  getCurrentView()

    .then(loadGui)

    .then(initTooltips)

    .then(toggleLoading);

}

/** -------- [###] -------- **/

function loadGui(view) {

  // display current view
  
  let child = document.createElement('div');
  
  child.innerText = JSON.stringify(view, null, 2);
  
  getElement('#hello-world').appendChild(child);

}