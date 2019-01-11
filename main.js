const electron = require('electron');
const url = require('url');
const path = require('path');
const fs = require('fs');
const openpgp = require('openpgp');
const socks = require('socksv5');
const http = require('http');
const https = require('https');
openpgp.initWorker({ path:'openpgp.worker.js' })
const request = require('request');
const appTitle = "TP secure mail";
const keyPatch = path.join(__dirname, 'keys/');
const keyNames = ['priv_key', 'pub_key', 'revocation',];
const archiver = require('archiver');

const socksConfig = {
    proxyHost: 'localhost',
    proxyPort: 9050,
    auths: [ socks.auth.None() ]
};

const {app, BrowserWindow, Menu, ipcMain} = electron;


// Or with ECMAScript 6
const {dialog} = require('electron');

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

   // let content = "Some text to save into the file";



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

async function encryptBinary(privkey,passphrase,pubkey, sourcePath, destinationPath) {
    //openpgp.readArmored(pubkey);
    var privKeyObj = (await openpgp.key.readArmored(privkey)).keys[0];
    var publicKeys = (await openpgp.key.readArmored(pubkey)).keys;
    await privKeyObj.decrypt(passphrase)
	/*const file = fs.readFileSync(sourcePath)
	const fileForOpenpgpjs = new Uint8Array(file)
    //console.log(publicKeys);
    var options = {
        message: openpgp.message.fromBinary(fileForOpenpgpjs),
        publicKeys: publicKeys,
        privateKey: privKeyObj,
        armor: false
    }
    const encryptionResponse = await openpgp.encrypt(options); // note the await here - this is async operation
    const encryptedFile = encryptionResponse.message.packets.write();
    fs.writeFileSync(destinationPath, encryptedFile);*/
	//console.log("Path: ");
	//console.log(sourcePath);
    const file = fs.readFileSync(sourcePath);

    const fileForOpenpgpjs = new Uint8Array(file);
    console.log("File : ");
    console.log(fileForOpenpgpjs);
    const options = {
        message :  openpgp.message.fromBinary(file),
        publicKeys: publicKeys,
        armor: false
    };
    const encryptionResponse = await openpgp.encrypt(options); // note the await here - this is async
    const encryptedFile = encryptionResponse.message.packets.write();
    fs.writeFileSync(destinationPath, encryptedFile);

    /*var doptions = {
        message: await openpgp.message.read(encryptedFile),
        format: 'binary',
        privateKeys: [privKeyObj]
    }

    openpgp.decrypt(doptions).then(function(plaintext) {
    	fs.writeFileSync(sourcePath,plaintext)
        console.log( plaintext.data); // Uint8Array([0x01, 0x01, 0x01])
    });*/

    /*const encrypted = await openpgp.encrypt(options);
    console.log(encrypted.message);
    //const ciphertext = encrypted.message.packets.write();
    return encrypted.message;*/
    /*openpgp.encrypt(options).then(async function(ciphertext)
	{
		console.log(ciphertext);
        /*const encrypted = ciphertext.message.packets.write(); // get raw encrypted packets as ReadableStream<Uint8Array>

        // Either pipe the above stream somewhere, pass it to another function,
        // or read it manually as follows:
        const reader = openpgp.stream.getReader(encrypted);
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            console.log('new chunk:', value); // Uint8Array
        }*/



        //const encrypted = ciphertext.message.packets.write();
        //const wstream = fs.createWriteStream(destinationPath);
        //ciphertext.message.pipe(wstream);
		//openpgp.stream.;
 //   });



}

async function decrypt(privkey,passphrase,message)
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

async function decryptBinary(privkey,passphrase,sourceFile,destFile)
{
	console.log(sourceFile)
	console.log(destFile)
    privKeyObj = (await openpgp.key.readArmored(privkey)).keys[0];
    await privKeyObj.decrypt(passphrase);

    const file = fs.readFileSync(sourceFile);

    const fileForOpenpgpjs = new Uint8Array(file);

    var options = {
        message: await openpgp.message.read(fileForOpenpgpjs),
        format: 'binary',
        privateKeys: [privKeyObj]
    }

    const decryptionResponse = await openpgp.decrypt(options);

    const decryptedFile = decryptionResponse.data;

	const unzip = require('unzip');
    fs.writeFileSync(destFile, decryptedFile);
   // var iStream=fs.createReadStream(destFile);
   // iStream.pipe(unzip.Extract({path: destFile.slice(0,-4)}));
    //const decrypted = await openpgp.decrypt(options);
    //const plaintext = await openpgp.stream.readToEnd(decrypted.data);
   // var plaintext = await openpgp.stream.readToEnd(decrypted.data);
    //var wstream = fs.createWriteStream(filePath)
	//wstream.write(plaintext)
	//wstream.close()
	//await openpgp.stream.pipe(decrypted.data,wstream)
	//fs.writeFileSync(filePath,plaintext);
	//return plaintext;
   // return(plaintext);
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


var fileNames = [];

function addFileToZip()
{
    console.log("yes");
    dialog.showOpenDialog({properties: ['openFile']},function(filenames) {
        if (filenames === undefined)
            return;

        fileNames.push(filenames[0]);
    });
    /*dialog.showMessageBox({ message: "Súbor pridaný na šifrovanie",

        buttons: ["OK"] });*/


}



async function zipFiles()
{
    var key = {
        privateKeyArmored: fs.readFileSync(keyPatch+keyNames[0]),
        publicKeyArmored: fs.readFileSync(keyPatch+keyNames[1]),
        revocationCertificate: fs.readFileSync(keyPatch+keyNames[2])
    };
    var path = require("path");
	console.log("I am here");
    var fileNumber = fileNames.length;
    for (var i =0; i< fileNumber; i++)
    {
        console.log(fileNames[i]);
     //   archive.file(fileNames[i]);
    }
    const options = {
        //title: 'Open a file or folder',
        //defaultPath: '/path/to/something/',
        //buttonLabel: 'Do it',
        /*filters: [
          { name: 'xml', extensions: ['xml'] }
        ],*/
        //properties: ['showHiddenFiles'],
        //message: 'This message will only be shown on macOS'
    };
	//var filename=;
    dialog.showSaveDialog(null, options, (filePaths) =>
	{
        /*if (filenames === undefined)
            return;*/
        //fileName = filenames[0];
		console.log("AAA Filename is ");
        console.log(filePaths);
        var archive = archiver('zip', {
            //gzip: true,
            zlib: { level: 9 } // Sets the compression level.
        });

        archive.on('error', function(err) {
            throw err;
        });
		var output = fs.createWriteStream(filePaths);
        archive.pipe(output);

        var fileNumber = fileNames.length;
        for (var i =0; i< fileNumber; i++)
        {
        	console.log(fileNames[i]);
            archive.file(fileNames[i],{ name: path.basename(fileNames[i]) });
        }

        fileNames = [];

        archive.on("finish", function(e)
		{
            encryptBinary(key.privateKeyArmored,'testtest',key.publicKeyArmored,filePaths,filePaths+".enc");
		});

        archive.finalize();





		return filePaths;

	});
    //var output = fs.createWriteStream('./example.zip')
}

async function uploadFile(filePath,token)
{
    var path = require("path");
    var Agent = require('socks5-http-client/lib/Agent');

    var url = 'https://myfile.is/api/upload';
    if ( typeof token !== 'undefined' && token )
    {
        url += token;
    }

    const formData = {
        file : {
            value: fs.createReadStream(filePath),
            options : {filename : path.basename(filePath)}
        }
    }

    const options = {
        url: url,
        agentClass: Agent,
        agentOptions: {
            socksHost: 'localhost', // Defaults to 'localhost'.
            socksPort: 9050 // Defaults to 1080.
        },
        formData: formData
    }

    request.post(options, function optionalCallback(err, httpResponse, body){
        if(err)
        {
            return console.error('upload failed:', err);
        }
        console.log('Upload successful!  Server responded with:', body);
    })
}

ipcMain.on("addFileToZip",function(e,data)
{
	console.log("hell yeah");
	addFileToZip();
});

ipcMain.on("zipFiles",function(e,data)
{
	zipFiles().then(function(filename)
	{
		if(filename === undefined)
			return;
		console.log("fileName is ");
		console.log(filename);


	});
})

ipcMain.on("decryptFile",function(e,data) {
    var key = {
        privateKeyArmored: fs.readFileSync(keyPatch + keyNames[0]),
        publicKeyArmored: fs.readFileSync(keyPatch + keyNames[1]),
        revocationCertificate: fs.readFileSync(keyPatch + keyNames[2])
    };


    dialog.showOpenDialog({properties: ['openFile']}, function (filenames) {
        if (filenames === undefined)
            return;
        //var iStream = fs.createReadStream(filenames[0]);
		//var cipherText = fs.readFileSync(filenames[0]);
        decryptBinary(key.privateKeyArmored, 'testtest', filenames[0], filenames[0]+".decrypt").then(function (a) {
            //fileNames.push(filenames[0]);
        });
    });
})
/*function connection()
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
}*/

function connect_Imap(user,password, host, port)
{
    var Imap = require('imap-socks5');
    
    var imap = new Imap({
    user: 'mygmailname@gmail.com',
    password: 'mygmailpassword',
    host: 'imap.gmail.com',
    port: 993,
    tls: true
    });
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
