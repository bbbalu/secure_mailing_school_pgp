const electron = require('electron');
const url = require('url');
const path = require('path');
const fs = require('fs');
var openpgp = require('openpgp');

const appTitle = "TP secure mail";
const keyPatch = path.join(__dirname, 'keys/');
const keyNames = ['priv_key', 'pub_key', 'sign_key'];

const {app, BrowserWindow, Menu, ipcMain} = electron;

let mainWindow, subWindow;

// ********** Helper functions ********** //

function urlSOS(filename) {
	return url.format({
		pathname: path.join(__dirname, filename),
		protocol: 'file:',
		slashes: true,
	});
}


// ********** Manage main application ********** //

app.on('closed', function(){
	app = null
});

// Listen fot app to be ready
app.on('ready', function(){
	// Create new window
	mainWindow = new BrowserWindow({
		title: appTitle
	});

	// Load the html content
	mainWindow.loadURL(urlSOS('main.html'));

	// Close all subwindows too
	mainWindow.on('closed', function() {
		app.quit();
	})

	// Load main menu
	const mainMenu = Menu.buildFromTemplate(mainMenuTemplate);

	// Insert menu
	Menu.setApplicationMenu(mainMenu);
});






// ********** Create popup windows ********** //

function createSubWindow(name, windowFilename, width = 300, height = 200) {

	subWindow = new BrowserWindow({
		width: width,
		height: height,
		title: appTitle
	});

	// Load the html content
	subWindow.loadURL(urlSOS(windowFilename));

	// Garbage collection
	subWindow.on('closed', function() {
		subWindow = null;
	})
}




// ********** Manage IPC messaging between main and page JS ********** //

// Close application
ipcMain.on('closeCommand', function(e, data) {
	app.quit();
});

// Key exists?
ipcMain.on('keygen:keyExists', function(e, data) {
	var existsBool = fs.existsSync(keyPatch+keyNames[0]) && fs.existsSync(keyPatch+keyNames[1]) && fs.existsSync(keyPatch+keyNames[2]);
	mainWindow.webContents.send('keygen:keyExists', existsBool);
});

// Generate new key pairs
ipcMain.on('keygen:createKeypairs', function(e, data) {
	console.log('ok');
	openpgp.generateKey({
		numBits: 512,
		userIds: [{ name:'Jon Smith', email:'jon@example.com' }],
		curve: "brainpoolP512r1",
		passphrase: 'testtest'
	}).then(function(key) {
		var privkey = key.privateKeyArmored; // '-----BEGIN PGP PRIVATE KEY BLOCK ... '
	    var pubkey = key.publicKeyArmored;   // '-----BEGIN PGP PUBLIC KEY BLOCK ... '
	    var revocationCertificate = key.revocationCertificate; // '-----BEGIN PGP PUBLIC KEY BLOCK ... '

	    mainWindow.webContents.send('keygen:showKeys', key);

	    fs.writeFile(keyPatch+keyNames[0], privkey, function(err) {
		    if(err) return console.log(err);
		});

	    fs.writeFile(keyPatch+keyNames[1], pubkey, function(err) {
		    if(err) return console.log(err);
		});

	    fs.writeFile(keyPatch+keyNames[2], revocationCertificate, function(err) {
		    if(err) return console.log(err);
		});

	}, function(err) { console.log(err); });

});

// Show keys
ipcMain.on('keygen:showKeys', function(e, data) {
	var key = {
		privateKeyArmored: fs.readFileSync(keyPatch+keyNames[0]),
		publicKeyArmored: fs.readFileSync(keyPatch+keyNames[1]),
		revocationCertificate: fs.readFileSync(keyPatch+keyNames[2])
	};

	mainWindow.webContents.send('keygen:showKeys', key);
});


// Catch ipc messages
ipcMain.on('data:sample', function(e, item) {
	console.log('item');
	mainWindow.webContents.send('item:add', item);
});




// ********** Main menu structure ********** //

// Main menu default structure
const mainMenuTemplate = [
{
	label: 'File',
	submenu: [
	{
		label: 'Refresh mails'
	},
	{
		label: 'Close application',
		accelerator: process.platform == 'darwin' ? 'Command+Q' : 'Ctrl+Q',
		click(){
			app.quit();
		}
	}
	]
}
];

// If mac, add empty object to menu to the first position
if (process.platform == 'darwin') {
	mainMenuTemplate.unshift({});
}

// If application was started in development mode
if (process.env.NOVE_ENV !== 'production') {
	mainMenuTemplate.push({
		label: 'Developer Tools',
		submenu: [
		{
			label: 'Refresh',
			accelerator: 'F5',
			role: 'reload'
		},
		{
			label: 'Toggle Dev tools',
			accelerator: 'F12',
			click(item, focusedWindow) {
				focusedWindow.toggleDevTools();
			}
		}
		]
	})
}