// Disable evil evals ;)
window.eval = global.eval = function () {
  throw new Error(`Sorry, this app does not support window.eval().`)
}

// Load electron
const electron = require('electron');
const {ipcRenderer} = electron;

// If true, all links in main menu are disabled
var disableNav = false;

// Save current page
var current_page = '';
var keygen_page = 'keygen.html';
var account_page = 'account.html';
// Test key exists
ipcRenderer.send('accountExists',true);
//ipcRenderer.send('keygen:keyExists', true);

//ipcRenderer.send("inbox",true);

// Answer from application main -> true: we have keys, false: we have to generate new keys
ipcRenderer.on('keygen:keyExists', function(e, data) {

	// If we are not on keygen page, test the key existence
	if (data == false) {
		disableNav = true;
		if (current_page != keygen_page) changePage(keygen_page);
	}
	else {
		disableNav = false;
       // ipcRenderer.send('accountExists',true);
	}

});



ipcRenderer.on('accountExists', function (e,data) {
    if (data == false) {
        disableNav = true;
        if (current_page != account_page) changePage(account_page);
    }
    else {
        disableNav = false;
        ipcRenderer.send('keygen:keyExists', true);
        //if(current_page != 'inbox.html') changePage('inbox.html');
        //changePage('inbox.html')
    }
})



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
	// If we are on selected page do nothing
	//if (current_page == htmlTo) return;

	// Inform the main controller about the page changing
	$("#page_content").load("./pages/"+htmlTo, function() {
		ipcRenderer.send('pages:loadedPageChanged', htmlTo);
		current_page = htmlTo;
	});
}



// Set homepage
changePage('inbox.html');