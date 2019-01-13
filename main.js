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
const profileDir = path.join(__dirname, 'profile/');
const inboxDir = path.join(__dirname, 'inbox/');
const adressDir = path.join(__dirname,'adressbook/');
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

    if((subWindow !== undefined) && (subWindow !== null))
    {
        subWindow.close();
    }

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

ipcMain.on('accountExists', function(e, data)
{
   var existsBool = fs.existsSync(profileDir+"profile.json");
   if(existsBool === true)
   {
       var acc = fs.readFileSync(profileDir+"profile.json");
       try{
           acc=JSON.parse(fs.readFileSync(profileDir+"profile.json"));
           if(acc === undefined)
               mainWindow.webContents.send('accountExists',false);
           if((acc.userName === undefined) || (acc.userName ===''))
               mainWindow.webContents.send('accountExists',false);
           if((acc.password === undefined) || (acc.password === ''))
               mainWindow.webContents.send('accountExists',false);
       }catch (e) {
           mainWindow.webContents.send('accountExists',false);
       }

   }
   else
       mainWindow.webContents.send('accountExists',existsBool);
});

ipcMain.on('accountCreated', function (e,data) {
   fs.writeFileSync(profileDir+"profile.json",JSON.stringify(data));
   //mainWindow.loadURL(urlSOS('main.html'))
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

ipcMain.on("inbox", function (e,data) {
    var checkbool = fs.existsSync(inboxDir+"inbox.json");
    if(checkbool === true)
    {
        var inbox;
        try {
            var inbox = JSON.parse(fs.readFileSync(inboxDir + "inbox.json"));
            console.log("Inbox is alive");
            console.log(inbox);
            mainWindow.send('inbox', inbox);
        }
        catch (e) {
            var inbox = [];
            fs.writeFileSync(inboxDir+"inbox.json",JSON.stringify(inbox));
            mainWindow.send('inbox', inbox);
        }
    }
    else
    {
        var inbox = [];
        fs.writeFile(inboxDir+"inbox.json",JSON.stringify(inbox));
        mainWindow.send('inbox', inbox);
    }
});

ipcMain.on("inbox:seeMail", function(e,data)
{
    console.log(data);
    var d = path.join(inboxDir+ data.folder + "/");
    console.log(d);
    var textFile = fs.readFileSync(d+".text.txt",'utf8');
    var info = data;
    info.folder = d;
    info.text = textFile;
    /*{
        folder : d,
        attachments: data.attachments,
        text: textFile,
        index : data.index
    }*/
    console.log(info);
    createSubWindow("lol", "pages/mailContent.html",
        600,800);
    subWindow.webContents.on('did-finish-load', () => {
        subWindow.webContents.send('message', 'Hello second window!');
        subWindow.webContents.send("inbox:message",info);
    });
});

ipcMain.on("compose", function (e,data) {
    fileNames = [];
    createSubWindow("lol", "pages/sent.html",
        600,800);
});

ipcMain.on("compose:getContacts", function(e, data)
{
    var existsBool = fs.existsSync(adressDir + "adressbook.json");
    if(existsBool === true)
    {
        console.log("hey");
        try{
            var adressBook = JSON.parse(fs.readFileSync(adressDir + "adressbook.json"));
            console.log(adressBook)
            subWindow.webContents.send("compose:getContacts",adressBook);

        }
        catch (e) {
            var adressBook = [];
            fs.writeFileSync(adressDir + "adressbook.json",JSON.stringify(adresBook));
            subWindow.webContents.send("compose:getContacts",adressBook);
        }
    }
    else
    {
        var adressBook = [];
        fs.writeFileSync(adressDir + "adressbook.json",JSON.stringify(adresBook));
        subWindow.webContents.send("compose:getContacts",adressBook);

    }
});

ipcMain.on("adressBook", function (e,data) {
    var existsBool = fs.existsSync(adressDir + "adressbook.json");
    if(existsBool === true)
    {
        console.log("hey");
        try{
            var adressBook = JSON.parse(fs.readFileSync(adressDir + "adressbook.json"));
            console.log(adressBook)
            mainWindow.webContents.send("adressBook",adressBook);

        }
        catch (e) {
            var adressBook = [];
            fs.writeFileSync(adressDir + "adressbook.json",JSON.stringify(adresBook));
            mainWindow.webContents.send("adressBook",adressBook);
        }
    }
    else
    {
        var adressBook = [];
        fs.writeFileSync(adressDir + "adressbook.json",JSON.stringify(adresBook));
        mainWindow.webContents.send("adressBook",adressBook);

    }


})
/*ipcMain.on("mailContent", function (e,data) {
    console.log("lol");
})*/

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
//async function encryptBinary(privkey,passphrase,pubkey, sourcePath) {
    //openpgp.readArmored(pubkey);

    var privKeyObj = (await openpgp.key.readArmored(privkey)).keys[0];
    var publicKeys = (await openpgp.key.readArmored(pubkey)).keys;
    await privKeyObj.decrypt(passphrase)

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
    //fs.writeFileSync(destinationPath, encryptedFile);
    //return encryptedFile;


    var ret = {
        name : sourcePath,
        stream : encryptedFile
    }
   return ret;



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

	//const unzip = require('unzip');
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
        if((subWindow !== undefined)  && (subWindow !== null))
        {
            subWindow.webContents.send("compose:addAttachment", filenames[0]);
        }
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
    var archive = archiver('zip', {
        //gzip: true,
        zlib: { level: 9 } // Sets the compression level.
    });

    archive.on('error', function(err) {
        throw err;
    });


	//var filename=;
    dialog.showSaveDialog(null, options, (filePaths) =>
	{
        /*if (filenames === undefined)
            return;*/
        //fileName = filenames[0];
		/*console.log("AAA Filename is ");
        console.log(filePaths);

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
            encryptBinary(key.privateKeyArmored,'testtest',key.publicKeyArmored,filePaths,filePaths+".enc").then(function (e)
            {
                console.log("Encryption finished !")
            });
		});
        archive.finalize();*/

                var output = fs.createWriteStream(filePaths);
                archive.pipe(output);
                //;

                archive.on("finish", function(e)
                {
                   console.log("Encryption finished");
                });
                var fileNumber = fileNames.length;
                counter = fileNumber;
                for (var i = 0; i < fileNumber; i++) {
                    encryptBinary(key.privateKeyArmored, 'testtest', key.publicKeyArmored, fileNames[i]).then(function (result)
                    {
                        fs.writeFileSync(result.name+".enc",result.stream);
                        archive.file(result.name+".enc", {name: path.basename(result.name+".enc")});
                        counter -= 1;
                        if(counter === 0)
                        {
                            console.log("Finished counting");
                            archive.finalize();
                        }
                    });
                    //archive.append(await encryptBinary(key.privateKeyArmored, 'testtest', key.publicKeyArmored, fileNames[i]), {name: path.basename(fileNames[i])});
                }




        fileNames = [];



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

ipcMain.on("compose:addAttachment",function(e,data)
{
	//console.log("hell yeah");
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

ipcMain.on("compose:removeAttachment", function (e,data) {
   console.log(data);
   var index = fileNames.indexOf(data);
   console.log("index is " + index);
    if (index > -1) {
        fileNames.splice(index, 1);
    }
    console.log(fileNames);
});

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
        decryptBinary(key.privateKeyArmored, 'testtest', filenames[0], filenames[0]+".dec").then(function (a) {
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

const mailLink = 'eludemaillhqfkh5.onion';
const imapPort = 143;
const smtpPort = 25;
let imap;
function connect_Imap(user,password, host, port)
{
    var Imap = require('imap-socks5');

    imap = new Imap({
    user: user,
    password: password,
    host: host,
    port: port,
    tls: true
    });

    imap.on("ready",function()
    {

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
