const electron = require('electron');
const url = require('url');
const path = require('path');
const fs = require('fs');
const openpgp = require('openpgp');
const socks = require('socksv5');
const http = require('http');
openpgp.initWorker({ path:'openpgp.worker.js' })
const request = require('request');
const appTitle = "TP secure mail";
const keyPatch = path.join(__dirname, 'keys/');
const keyNames = ['priv_key', 'pub_key', 'revocation',];

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

// Listen for app to be ready
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
		numBits: 4096,
		userIds: [{ name:'Jon Smith', email:'jon@example.com' }],
		//curve: "brainpoolP512r1",
		passphrase: 'testtest',
		subkeys: [{sign:true, numBits: 2048},{sign:false,  numBits: 2048}]
	}).then(function(key) {
		console.log(key);
		var privkey = key.privateKeyArmored; // '-----BEGIN PGP PRIVATE KEY BLOCK ... '
	    var pubkey = key.publicKeyArmored;   // '-----BEGIN PGP PUBLIC KEY BLOCK ... '
	    var revocationCertificate = key.revocationCertificate; // '-----BEGIN PGP PUBLIC KEY BLOCK ...
		//var privKeyObj = openpgp.key.readArmored(privkey).keys[0];
		//console.log(privKeyObj)
		//console.log(key.key.publicKeyArmored);
		//var privsubk1 = key.subkeys[0].privateKeyArmored;
		//var pubsubk1 = key.subkeys[0].publicKeyArmored;
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
	connection();
	encrypt(key.privateKeyArmored,'testtest',key.publicKeyArmored,"Hello this is test message").then(function(result){
        console.log(result);
       // ciphertext = result;
        decrypt(key.privateKeyArmored,'testtest',result.data,).then(function (a)
		{
			console.log(a);
		});
    });
	sign(key.privateKeyArmored,"testtest","Hello world").then(function (signedtext)
	{
		console.log("THIS IS SIGNED TEXT");
		console.log(signedtext);
        verify(key.publicKeyArmored,signedtext).then(function (v)
		{
			console.log("Is valid " + v);
		});
	});

	mainWindow.webContents.send('keygen:showKeys', key);
});


// Catch ipc messages
ipcMain.on('data:sample', function(e, item) {
	console.log('item');
	mainWindow.webContents.send('item:add', item);
});


async function encrypt(privkey,passphrase,pubkey, message) {
	//openpgp.readArmored(pubkey);
    var privKeyObj = (await openpgp.key.readArmored(privkey)).keys[0];
	var publicKeys = (await openpgp.key.readArmored(pubkey)).keys;
    await privKeyObj.decrypt(passphrase)
	console.log(publicKeys);
	var options = {
		message: openpgp.message.fromText(message),
		publicKeys: publicKeys,
		privateKey: privKeyObj
	}
    const encrypted = await openpgp.encrypt(options);
	return encrypted;
}

async function decrypt(privkey,passphrase,message,)
{
    privKeyObj = (await openpgp.key.readArmored(privkey)).keys[0];
    await privKeyObj.decrypt(passphrase);
    var options = {
    	message: await openpgp.message.readArmored(message),
		privateKeys: [privKeyObj]
	}
    var decrypted = await openpgp.decrypt(options);
    var plaintext = await openpgp.stream.readToEnd(decrypted.data);
    return(plaintext);
}

async function sign(privkey, passphrase, message) {
    var privKeyObj = (await openpgp.key.readArmored(privkey)).keys[0];
    await privKeyObj.decrypt(passphrase);

    var options = {
        message: openpgp.cleartext.fromText(message), // CleartextMessage or Message object
        privateKeys: [privKeyObj]                             // for signing
    };

    var signedText = await (openpgp.sign(options));
    //console.log(cleartext);
    return signedText.data;
}

async function verify(pubkey,message)
{
    var options = {
        message: await openpgp.cleartext.readArmored(message), // parse armored message
        publicKeys: (await openpgp.key.readArmored(pubkey)).keys // for verification
    };
	var verified = await openpgp.verify(options);
	var validity  = verified.signatures[0].valid;
	console.log(validity);
	return validity;
}

function connection()
{
	var Agent = require('socks5-http-client/lib/Agent');

	request({
		url: 'http://eludemaillhqfkh5.onion',
		agentClass: Agent,
		agentOptions: {
			socksHost: 'localhost',
			socksPort: 9050
		}
	
	}, function(err,res){
	console.log(err || res.body);});
}

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
