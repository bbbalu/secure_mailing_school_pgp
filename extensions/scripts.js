// Disable evil evals ;)
window.eval = global.eval = function () {
  throw new Error(`Sorry, this app does not support window.eval().`)
}

// Load electron
const electron = require('electron');
const {ipcRenderer} = electron;

// If true, all links in main menu are disabled
var disableNav = false;

// Test key exists
ipcRenderer.send('keygen:keyExists', true);

// Answer from application main -> true: we have keys, false: we have to generate new keys
ipcRenderer.on('keygen:keyExists', function(e, data) {
	if (data == false) {
		disableNav = true;
		changePage('keygen.html');
	}
	else {

	}
	// Do something with data
	// Data always cames from nodeJS app not from sub HTMLs

});



$("nav a").click(function(e) {
	e.preventDefault();

	// Close button in main menu was clicked
	if ($(this).attr('id') == 'close') {
		ipcRenderer.send('closeCommand', true);
		return;
	}

	// Main menu is disabled
	if (disableNav) return;

	if ($(this).closest('.main_navigation').length > 0) {
		$('.main_navigation').find('li').removeClass('active');
		$(this).closest('li').addClass('active');
	}

	changePage($(this).attr('href'));
})


function changePage(htmlTo) {
	// Inform the main controller about the page changing
	$("#page_content").load("./pages/"+htmlTo, function() {
		ipcRenderer.send('pages:loadedPageChanged', htmlTo);
	});
}

// Set homepage
changePage('inbox.html');