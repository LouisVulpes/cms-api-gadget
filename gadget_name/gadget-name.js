/**
 * gadget-name.js
 * 
 * @author [author]
 * @copyright [copyright]
 */
 
 /** -------- [VARIABLES] -------- **/

var api; // {}

var current; // {}

var groups, users; // {}

/** -------- [INIT] -------- **/

$(() => gadget.ready(init));

function init() {

  api = new CmsApi();

  getCurrentView()

    .then(loadGui)

    .then(initTooltips)

    .then(toggleLoading);

}

/** -------- [LOAD] -------- **/

function loadGui(view) {

  // display current view
  
  let child = document.createElement('div');
  
  child.innerText = JSON.stringify(view, null, 2);
  
  getElement('#hello-world').appendChild(child);

}