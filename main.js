var ImapClient = require('emailjs-imap-client');
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
const addressDir = path.join(__dirname,'addressbook/');
const outboxDir = path.join(__dirname,"outbox/");
const tmpDir  = path.join(__dirname, 'tmp/');
const keyNames = ['priv_key', 'pub_key', 'revocation',];
const archiver = require('archiver');
const unzipper = require('unzipper');
const locks = require('locks');
const nodemailer = require('nodemailer');
const randomstring = require("randomstring");

const mailLink = 'eludemaillhqfkh5.onion';
const imapPort = 143;
const smtpPort = 25;
let imap;

const socksConfig = {
    proxyHost: 'localhost',
    proxyPort: 9050,
    auths: [ socks.auth.None() ]
};

var writeLock = locks.createMutex();

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
           else if((acc.userName === undefined) || (acc.userName ===''))
               mainWindow.webContents.send('accountExists',false);
           else if((acc.password === undefined) || (acc.password === ''))
               mainWindow.webContents.send('accountExists',false);
           else
           {
               console.log(acc);
               if((acc.smtpUrl == undefined)|| (acc.smtpUrl == ""))
                   acc.smtpUrl = mailLink;
               if((acc.smtpPort == undefined)|| (acc.smtpPort == ""))
                   data.smtpPort = smtpPort;
               if((acc.imapUrl == undefined)|| (acc.imapUrl == ""))
                   data.imapUrl = mailLink;
               if((acc.imapPort == undefined)|| (acc.imapPort == ""))
                   acc.imapPort = imapPort;
               console.log("Link is " + mailLink);
               acc.imapUrl = mailLink;
               console.log(acc.password);
               console.log("Connecting to : " + acc.userName +" " +acc.password + " " + acc.imapUrl +" " + acc.imapPort);
                //connect_Imap(acc.userName,acc.password,acc.imapUrl,acc.imapPort);

               mainWindow.webContents.send('accountExists',true);
               //conImap(acc.userName,acc.password,acc.imapUrl,acc.imapPort);
           }
       }catch (e) {
           mainWindow.webContents.send('accountExists',false);
       }

   }
   else
       mainWindow.webContents.send('accountExists',existsBool);
});

async function conImap(userName,password,url,port)
{
    console.log("IMMA HERE");
    var client = new ImapClient.default(url, port, {
        auth: {
            user: userName,
            pass: password
        }
    });

    client.connect().then(() => {
        console.log("Connected");
        client.listMailboxes().then((mailboxes) => {
            console.log(mailboxes);
        });
    });
}

ipcMain.on("account:isCreated", function (e, data)
{
    var existsBool = fs.existsSync(profileDir+"profile.json");
    if(existsBool === true)
    {
        var acc = fs.readFileSync(profileDir+"profile.json");
        try{
                acc = JSON.parse(acc);
                console.log(acc);
                if((acc.smtpUrl == undefined)|| (acc.smtpUrl == ""))
                    acc.smtpUrl = mailLink;
                if((acc.smtpPort == undefined)|| (acc.smtpPort == ""))
                    data.smtpPort = smtpPort;
                if((acc.imapUrl == undefined)|| (acc.imapUrl == ""))
                    data.imapUrl = mailLink;
                if((acc.imapPort == undefined)|| (acc.imapPort == "")) {
                    acc.imapPort = imapPort;
                }
                if(acc.token == undefined)
                    acc.token="";

                console.log("Link is " + mailLink);
                //acc.imapUrl = mailLink;
                //console.log(acc.password);
                //console.log("Connecting to : " + acc.userName +" " +acc.password + " " + acc.imapUrl +" " + acc.imapPort);
                //connect_Imap(acc.userName,acc.password,acc.imapUrl,acc.imapPort);

                mainWindow.webContents.send("account:isCreated",acc);
                conImap(acc.userName,acc.password,acc.imapUrl,acc.imapPort);

        }catch (e) {
            mainWindow.webContents.send('account:isCreated',null);
        }

    }
    else
        mainWindow.webContents.send('account:isCreated',null);
});

ipcMain.on('accountCreated', function (e,data) {

    // check
    if((data.smtpUrl == undefined)|| (data.smtpUrl == ""))
        data.smtpUrl = mailLink;
    if((data.smtpPort == undefined)|| (data.smtpPort == ""))
        data.smtpPort = smtpPort;
    if((data.imapUrl == undefined)|| (data.imapUrl == ""))
        data.imapUrl = mailLink;
    if((data.imapPort == undefined)|| (data.imapPort == ""))
        data.imapPort = imapPort;
    if(data.token == undefined)
        data.token = "";

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






	    fs.writeFileSync(keyPatch+keyNames[0], privkey);

	    fs.writeFileSync(keyPatch+keyNames[1], pubkey);

	    fs.writeFileSync(keyPatch+keyNames[2], revocationCertificate);
        readPublicKey(keyPatch+keyNames[1]).then(function (res){
            var d = {
                publicKeyArmored : pubkey,
                fingerprint : toHexString(res)
            }
            mainWindow.webContents.send('keygen:showKeys', d);
        });


	}, function(err) { console.log(err); });

});

ipcMain.on("keygen:exportPubKey",function(e,data)
{
    var options = {
        title : "Export public key",
        message : "Select file name for your public key"
    }
    dialog.showSaveDialog(null,options,(filePaths) =>
    {
       if(filePaths == undefined)
           return;
       fs.copyFileSync(keyPatch+keyNames[1],filePaths);
    });
});

// Show keys
ipcMain.on('keygen:showKeys', function(e, data) {

   // let content = "Some text to save into the file";



    /*var key = {
        privateKeyArmored: fs.readFileSync(keyPatch+keyNames[0]),
        publicKeyArmored: fs.readFileSync(keyPatch+keyNames[1]),
        revocationCertificate: fs.readFileSync(keyPatch+keyNames[2])
    };*/
    var key ={
        publicKeyArmored: fs.readFileSync(keyPatch+keyNames[1]),

    }
    readPublicKey(keyPatch+keyNames[1]).then(function (res)
    {
       key.fingerprint = toHexString(res);
       mainWindow.webContents.send('keygen:showKeys', key);
    });
    

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
        fs.writeFileSync(inboxDir+"inbox.json",JSON.stringify(inbox));
        mainWindow.send('inbox', inbox);
    }
});

ipcMain.on("inbox:seeMail", function(e,data)
{
    //console.log(data);
    var d = path.join(inboxDir+ data.folder + "/");
    //console.log(d);
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
    //console.log(info);
    createSubWindow("lol", "pages/mailContent.html",
        600,800);
    subWindow.webContents.on('did-finish-load', () => {
        subWindow.webContents.send('message', 'Hello second window!');
        subWindow.webContents.send("inbox:message",info);
    });
});

ipcMain.on("compose", function (e,data) {
    fileNames = [];
    createSubWindow("Compose new Email", "pages/sent.html",
        600,800);
});

ipcMain.on("compose:getContacts", function(e, data)
{
    var existsBool = fs.existsSync(addressDir + "addressbook.json");
    if(existsBool === true)
    {

        try{
            var addressBook = JSON.parse(fs.readFileSync(addressDir + "addressbook.json"));
            console.log(addressBook)
            subWindow.webContents.send("compose:getContacts",addressBook);

        }
        catch (e) {
            var addressBook = [];
            fs.writeFileSync(addressDir + "addressbook.json",JSON.stringify(addressBook));
            subWindow.webContents.send("compose:getContacts",addressBook);
        }
    }
    else
    {
        var addressBook = [];
        fs.writeFileSync(addressDir + "addressbook.json",JSON.stringify(addressBook));
        subWindow.webContents.send("compose:getContacts",addressBook);

    }
});

ipcMain.on("addressBook", function (e,data) {
    var existsBool = fs.existsSync(addressDir + "addressbook.json");
    if(existsBool === true)
    {

        try{
            var addressBook = JSON.parse(fs.readFileSync(addressDir + "addressbook.json"));
            console.log(addressBook)
            mainWindow.webContents.send("addressBook",addressBook);

        }
        catch (e) {
            var addressBook = [];
            fs.writeFileSync(addressDir + "addressbook.json",JSON.stringify(addressBook));
            mainWindow.webContents.send("addressBook",addressBook);
        }
    }
    else
    {
        var addressBook = [];
        fs.writeFileSync(addressDir + "addressbook.json",JSON.stringify(addressBook));
        mainWindow.webContents.send("addressBook",addressBook);

    }


});

ipcMain.on("addressBook:addContact", function(e,data)
{
    createSubWindow("Add Contact","pages/addContact.html",600,800);
});

function toHexString(byteArray) {
    return Array.prototype.map.call(byteArray, function(byte) {
        return ('0' + (byte & 0xFF).toString(16)).slice(-2);
    }).join('');
}

function toByteArray(hexString) {
    var result = [];
    while (hexString.length >= 2) {
        result.push(parseInt(hexString.substring(0, 2), 16));
        hexString = hexString.substring(2, hexString.length);
    }
    return result;
}

async function readPublicKey(filePath)
{

    try {
        var pubKeyFile = fs.readFileSync(filePath);
        //console.log(pubKeyFile);
        var publicKeys = (await openpgp.key.readArmored(pubKeyFile)).keys;
        //console.log(typeof publicKeys[0]);
        console.log("GOT HERE");
        //console.log(publicKeys);
        var id = publicKeys[0].keyPacket;
        //console.log(id);
        //console.log(id instanceof openpgp.PublicKey);
        //console.log(id.fingerprint);
        return id.fingerprint;
    }
    catch (e) {
        return null;
    }

}
ipcMain.on("addressBook:addPKey",function(e,data)
{
    dialog.showOpenDialog({properties: ['openFile']},function(filenames) {
       if(filenames === undefined)
           return;
       try
       {
           readPublicKey(filenames[0]).then(function (res) {
               if(res === null)
               {
                   subWindow.webContents.send("addressBook:invalidPKey",true);
                   return;
               }

           var data = {};
           data.path = filenames[0];
           data.fingerprint = toHexString(res);
           subWindow.webContents.send("addressBook:pkeyAdded", data);
           });
       }
       catch (e) {
           console.log("Caught")
           subWindow.webContents.send("addressBook:invalidPKey",true);
       }

    });
});

function validateEmail(email) {
    var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(String(email).toLowerCase());
}

ipcMain.on("addressBook:contactAdded",function (e, data)
{
    var isEmail = validateEmail(data.email);
    if(isEmail)
    {
        if(data.name !== "")
        {
            var addressBook = [];
            if(fs.existsSync(addressDir + "addressbook.json"))
                addressBook = JSON.parse(fs.readFileSync(addressDir + "addressbook.json"));
            var i;
            for(i=0; i< addressBook.length; i++)
            {
                if(addressBook[i].email === data.email)
                {
                    //addressBook[i].name = data.name;
                    //addressBook[i].key = keyName;
                    subWindow.webContents.send("addressBook:contactExists",true);
                    return;
                }
            }
            try
            {
                readPublicKey(data.pkey).then(function (res)
                {
                    if(res === null) {
                        subWindow.webContents.send("addressBook:invalidPKey",true);
                        return;
                    }
                        var keyName = data.email+"-pub_key";
                        var exitsBool = fs.existsSync(addressDir+keyName);
                        //var i=0;
                        while(exitsBool === true)
                        {
                            keyName =  data.email + "-" + i +"pub_key";
                            i+=1;
                            exitsBool = fs.existsSync(addressDir+keyName)
                        }
                        fs.copyFileSync(data.pkey,addressDir+keyName);

                        var newContact = {};
                        newContact.name = data.name;
                        newContact.email = data.email;
                        newContact.key = keyName;
                        addressBook.push(newContact);


                        console.log("Adding new contact");
                        console.log(newContact);
                        console.log(addressBook);
                        fs.writeFileSync(addressDir+"addressbook.json",JSON.stringify(addressBook));
                    });


            }
            catch (e) {
                console.log("caught errorr");
                console.log(e);
            }
        }
        else
        {
            subWindow.webContents.send("addressBook:noName",true);
            console.log("name is empty");
        }
        //if((data.name !== "")&& ())
    }
    else
    {
        subWindow.webContents.send("addressBook:invalidEmail",true);

        console.log("is not email");
    }

});

ipcMain.on("addressBook:modifyAccount",function (e,data) {
    var addressBook = [];
    console.log("hello there");
    if(fs.existsSync(addressDir+"addressbook.json"))
    {
        console.log("general kenobi");
        try {
            addressBook = JSON.parse(fs.readFileSync(addressDir+"addressbook.json"));
            console.log("you are a bold one");
            console.log("data is " + data);
            console.log("addressbook is " + addressBook);
            for(var i=0; i< addressBook.length; i++)
            {
                console.log("email is " + addressBook[i].email);
                if(addressBook[i].email === data)
                {
                    console.log("The council does not grant you a rang of master");
                    var d = addressBook[i];
                    readPublicKey(addressDir+d.key).then(function (res)
                    {
                       if(res !== null)
                       {
                           d.key = addressDir + d.key;
                           d.keyFingerprint = toHexString(res);
                           createSubWindow("Modify contact","pages/editContact.html",600,800);
                           subWindow.webContents.on('did-finish-load', () => {

                               subWindow.webContents.send("addressBook:modifyAccount",d);
                           });
                       }
                    });
                }
            }
        }
        catch (e) {
            dialog.showErrorBox("Something wrong with address book", "Something wrong happened with the address book");
        }
    }
});

ipcMain.on("addressBook:contactModified",function (e,data) {
    var isEmail = validateEmail(data.email);
    if (isEmail) {
        if (data.name !== "")
        {
            var addressBook = [];
            if (fs.existsSync(addressDir + "addressbook.json"))
                addressBook = JSON.parse(fs.readFileSync(addressDir + "addressbook.json"));

            try {
                readPublicKey(data.pkey).then(function (res) {
                    if (res === null) {
                        subWindow.webContents.send("addressBook:invalidPKey", true);
                        return;
                    }
                    var modified;
                    for (var i = 0; i < addressBook.length; i++) {
                        if (addressBook[i].email === data.email) {
                            console.log("the last place");
                            console.log(addressBook[i]);
                            var origBuff = fs.readFileSync(addressDir+addressBook[i].key);
                            var newBuff = fs.readFileSync(data.pkey);
                            modified = !origBuff.equals(newBuff);

                            if(modified) {
                                //console.log("what is even goiudn on " + addressBook[i]);
                                var keyName = data.email + "-pub_key";
                                var exitsBool = fs.existsSync(addressDir + keyName);
                                var j = 0;
                                while (exitsBool === true) {
                                    keyName = data.email + "-" + j + "pub_key";
                                    j += 1;
                                    exitsBool = fs.existsSync(addressDir + keyName)
                                }

                                addressBook[i].key = keyName;
                                try {
                                    fs.copyFileSync(data.pkey, addressDir + keyName);
                                }
                                catch (e) {

                                }
                            }
                            else
                            {
                                console.log("key was not modified");
                            }

                            addressBook[i].name = data.name;

                            fs.writeFileSync(addressDir + "addressbook.json",JSON.stringify(addressBook));
                            return;
                        }
                    }

                    //i;



                });
            }
            catch (e) {
                return;

            }

        }
        else {
            subWindow.webContents.send("addressBook:noName", true);
            console.log("name is empty");
            return;
        }
    }
    else {
        subWindow.webContents.send("addressBook:invalidEmail", true);
    }
});


/*ipcMain.on("mailContent", function (e,data) {
    console.log("lol");
})*/

async function encrypt(privkey,passphrase,pubkey, message) {
	//openpgp.readArmored(pubkey);
    var privKeyObj = (await openpgp.key.readArmored(privkey)).keys[0];
	var publicKeys = (await openpgp.key.readArmored(pubkey)).keys;
    await privKeyObj.decrypt(passphrase)

	var options = {
		message: openpgp.message.fromText(message),
		publicKeys: publicKeys,
		privateKey: privKeyObj
	}
    const encrypted = await openpgp.encrypt(options);
	return encrypted.data;
}

// private key used for signing the encrypted data
// public key of the recipient used to encrypt the data
async function encryptBinary(privkey,passphrase,pubkey, sourcePath) {
//async function encryptBinary(privkey,passphrase,pubkey, sourcePath) {
    //openpgp.readArmored(pubkey);
    var privKeyObj = (await openpgp.key.readArmored(privkey)).keys[0];
    var publicKeys = (await openpgp.key.readArmored(pubkey)).keys;
    await privKeyObj.decrypt(passphrase)

    const file = fs.readFileSync(sourcePath);

    const fileForOpenpgpjs = new Uint8Array(file);

    const options = {
        message :  openpgp.message.fromBinary(file),
        publicKeys: publicKeys,
        privateKey: privKeyObj,
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

ipcMain.on("message:received",function(e,data)
{
    var addressBook = [];
    if(fs.existsSync(addressDir+"addressbook.json"))
    {
        try {
            addressBook = JSON.parse(fs.readFileSync(addressDir + "addressbook.json"));
        }
        catch (e) {
            addressBook = [];
        }
    }
    var publicKey = null;
    for(var i=0;i<addressBook.length;i++)
    {
        if(addressBook[i].email === data.sender)
            publicKey = addressDir + addressBook[i].key;
    }
    if(publicKey !== null)
        publicKey = fs.readFileSync(publicKey);
    decrypt(fs.readFileSync(keyPatch+keyNames[0]),'testtest',publicKey,data.message).then(function(decryptedUrl)
    {
        console.log(decryptedUrl);
        var zipName = randomstring.generate({
            charset: 'alphanumeric'
        })
        downloadFile(decryptedUrl,tmpDir+zipName).then(function ()
        {
            unzipAndDecrypt(zipName,publicKey);
        })
        // todo
    });
    
});

// private key of recipient to decrypt the data
// public key of the sender to verify signed data
async function decrypt(privkey,passphrase,pubkey,message)
{
    privKeyObj = (await openpgp.key.readArmored(privkey)).keys[0];

    await privKeyObj.decrypt(passphrase);
    var options;
    if(pubkey == null) {
        options = {
            message: await openpgp.message.readArmored(message),
            privateKeys: [privKeyObj]
            //publicKeys: (await openpgp.key.readArmored(pubkey)).keys
        }
    }
    else
    {
        options = {
            message: await openpgp.message.readArmored(message),
            privateKeys: [privKeyObj],
            publicKeys: (await openpgp.key.readArmored(pubkey)).keys
        }
    }
    var decrypted = await openpgp.decrypt(options);
    var plaintext = await openpgp.stream.readToEnd(decrypted.data);
    return(plaintext);
}

// private key of recipient to decrypt the data
// public key of the sender to verify signed data
async function decryptBinary(privkey,passphrase,pubkey,sourceFile,destFile)
{

    var privKeyObj = (await openpgp.key.readArmored(privkey)).keys[0];
    await privKeyObj.decrypt(passphrase);
    var publicKeys = (await openpgp.key.readArmored(pubkey)).keys;
    const file = fs.readFileSync(sourceFile);

    const fileForOpenpgpjs = new Uint8Array(file);
    var options;
    if(pubkey == null)
    {
        options = {
            message: await openpgp.message.read(fileForOpenpgpjs),
            format: 'binary',
           //publicKeys: publicKeys,
            privateKeys: [privKeyObj]
        }
    }
    else
    {
        options = {
            message: await openpgp.message.read(fileForOpenpgpjs),
            format: 'binary',
            publicKeys: publicKeys,
            privateKeys: [privKeyObj]
        }
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

    var fileNumber = fileNames.length;
    for (var i =0; i< fileNumber; i++)
    {
        console.log(fileNames[i]);
     //   archive.file(fileNames[i]);
    }

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
                            //console.log("Finished counting");
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

function smtp (url,port,userName,password,recipient,message)
{
    let transporter = nodemailer.createTransport({
        host: url,
        port: port,
        secure: true,
        proxy: 'socks5://localhost:9050',
        auth :
            {
                user: userName,
                password: password
            }
    });
// enable support for socks URLs
    transporter.set('proxy_socks_module', require('socks'));

    var message = {
        from: userName,
        to: recipient,
        subject: randomstring.generate({
            charset: 'alphanumeric'
        }),
        text: message
    };

    transporter.sendMail(message,function(err,info,response)
    {
        if(err)
        {
            console.log(err);
        }
    })
}

async function encryptAndZip(zipName,publicKey ,fileList,recipient,token)
{
    var privateKey = fs.readFileSync(keyPatch+keyNames[0]);
    var archive = archiver('zip', {
        //gzip: true,
        zlib: { level: 9 } // Sets the compression level.
    });
    archive.on('error', function(err) {
        throw err;
    });
    archive.on('finish',function()
    {

        Object.keys(fileList).forEach(function(key) {
            fs.unlinkSync(tmpDir+fileList[key]);
        });
        fs.unlinkSync(tmpDir+".text.txt");
        writeLock.unlock();
        console.log("Zip name: " + zipName);

        /// get token somehow


        uploadFile(tmpDir+zipName,token,publicKey,recipient);

        // node mailer, + encreypt the

        //unzipAndDecrypt(path.basename( zipName),publicKey);

    });
    var output = fs.createWriteStream(tmpDir+zipName);
    archive.pipe(output);
    var attLength = Object.keys(fileList).length;
    var counter = attLength;
    Object.keys(fileList).forEach(function(key) {
        //console.log(key, originalNames[key]);
        encryptBinary(privateKey, 'testtest',publicKey,key).then(function (result) {

            fs.writeFileSync(tmpDir+fileList[key],result.stream);
            archive.file(tmpDir+fileList[key], {name: fileList[key]});
            counter -= 1;
            if(counter === 0)
            {

                archive.finalize();
            }
        })

    });

}
async function unzipAndDecrypt(zipName,publicKey)
{
    var decryptedDir = zipName;

    writeLock.lock(function()
        {
            var privateKey = fs.readFileSync(keyPatch+keyNames[0]);
            var exitsBool = fs.existsSync(inboxDir + decryptedDir);
            while(exitsBool === true)
            {
                decryptedDir=randomstring.generate({
                    charset: 'alphanumeric'
                });
                exitsBool = fs.existsSync(inboxDir + decryptedDir);
            }

            fs.mkdirSync(inboxDir + decryptedDir);
            decryptedDir = path.join(inboxDir,decryptedDir+"/");

            fs.createReadStream(tmpDir + zipName).pipe(unzipper.Extract({ path: decryptedDir }).on('close', function (){


                decryptBinary(privateKey,'testtest',publicKey,decryptedDir+".message.json", decryptedDir+"..message.json").then(function () {


                    fs.unlinkSync(decryptedDir+".message.json");
                    var messageLog = JSON.parse(fs.readFileSync(decryptedDir+"..message.json"));
                    var counter = Object.keys(messageLog.attachments).length;
                    //console.log("counter is  "+counter);
                    //console.log(messageLog);
                    Object.keys(messageLog.attachments).forEach(function(key) {

                            decryptBinary(privateKey,'testtest',publicKey,decryptedDir+messageLog.attachments[key],decryptedDir+key).then(function () {
                                counter -=1;
                                if(counter ===0)
                                {

                                    var inbox = JSON.parse(fs.readFileSync(inboxDir+"inbox.json"));
                                    var newMail = {};
                                    //newMail.sender= sender;
                                    newMail.date=messageLog.date;

                                    newMail.subject = messageLog['subject'];
                                    newMail.sender = messageLog.sender;
                                    var attachments = [];
                                    Object.keys(messageLog.attachments).forEach(function(key)
                                    {

                                        if(key !== ".text.txt")
                                            attachments.push(key);
                                        fs.unlinkSync(decryptedDir+messageLog.attachments[key]);
                                    });
                                    newMail.attachments=attachments;
                                    fs.unlinkSync(decryptedDir+"..message.json");
                                    fs.writeFileSync(decryptedDir+".message.json",JSON.stringify(newMail));
                                    newMail.folder = path.basename(decryptedDir);
                                    inbox.push(newMail);

                                    //fs.unlinkSync(decryptedDir+".message.json");

                                    fs.writeFileSync(inboxDir+"inbox.json",JSON.stringify(inbox));

                                    writeLock.unlock();
                                }
                            });
                    });


                });
               //writeLock.unlock();
               console.log("Just needs unlocking")
                //decrypt - add to inbox.json



            }));
        }
    );
}

async function uploadFile(filePath,token,publicKey,recipient)
{
    //var path = require("path");
    var Agent = require('socks5-https-client/lib/Agent');

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
        var resp = JSON.parse(body);

        fs.writeFileSync(outboxDir+path.basename(filePath)+"-resp.txt",body);
        if(resp.status === true)
        {
            console.log("we are here");
            console.log(resp.data.file.url.short);
            var url = resp.data.file.url.short;
                if((url !== undefined) && (url !== null))
                {
                    // nodemailer create transport,
                    encrypt(fs.readFileSync(keyPatch+keyNames[0]),'testtest',publicKey,url).then(function(encryptedUrl)
                    {
                        // send emdial through nodemailer
                        //smtp();
                        var acc= JSON.parse(fs.readFileSync(profileDir+"profile.json"));
                        fs.writeFileSync(outboxDir+path.basename(filePath)+"-url.txt",encryptedUrl);
                        smtp(acc.smtpUrl,acc.smtpPort,acc.userName,acc.password,encryptedUrl);
                        console.log(encryptedUrl);
                    });
                }
                else
                {
                    console.log("error");
                    console.log(encryptedUrl);
                }

            //return(resp.data.file.url.short);
        }
    });
}

async function downloadFile(fileURL,fileDestination)
{
    var Agent = require('socks5-http-client/lib/Agent');
    const options = {
        url: fileURL,
        agentClass: Agent,
        agentOptions: {
            socksHost: 'localhost', // Defaults to 'localhost'.
            socksPort: 9050 // Defaults to 1080.
        }
    }
    request
        .get(options)
        .on('response', function(response) {
            console.log(response.statusCode) // 200
            console.log(response.headers['content-type']) // 'image/png'
        })
        .pipe(fs.createWriteStream(fileDestination));
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

ipcMain.on("outbox", function (e,data) {
    var existsBool = fs.existsSync(outboxDir+"outbox.json");
    var outbox = [];
    if(existsBool)
    {
        try{
            outbox = JSON.parse(fs.readFileSync(outboxDir+"outbox.json"));
        }
        catch (e) {
            
        }
    }
    else
    {
        fs.writeFileSync(outboxDir+"outbox.json",JSON.stringify([]));
    }
    mainWindow.webContents.send("outbox",outbox);
});

ipcMain.on("outbox:seeMail",function(e,data)
{
    var d = path.join(outboxDir+ data.folder + "/");
    //console.log(d);
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
    //console.log(info);
    createSubWindow("Outbox Message", "pages/outboxMessage.html",
        600,800);
    subWindow.webContents.on('did-finish-load', () => {
        subWindow.webContents.send('message', 'Hello second window!');
        subWindow.webContents.send("outbox:message",info);
    });
});


ipcMain.on("compose:removeAttachment", function (e,data) {
   console.log(data);
   var index = fileNames.indexOf(data);
   console.log("index is " + index);
    if (index > -1) {
        fileNames.splice(index, 1);
    }
    console.log(fileNames);
});

ipcMain.on("compose:send", function (e,data) {
    sendEmail(data);
});

async function sendEmail(data)
{

    console.log("sneding email - ");
    console.log(data);
    var attachments = fileNames.slice();
    //attachments[0] = "not my attachment";
    fileNames = [];

    writeLock.lock(function ()
    {
        var zipName = randomstring.generate({
            charset: 'alphanumeric'
        });
        var existsBool = fs.existsSync(outboxDir+zipName);
        while(existsBool === true)
        {
            zipName = randomstring.generate({
                charset: 'alphanumeric'
            });
            existsBool = fs.existsSync(outboxDir+zipName);
        }
        fs.mkdirSync(outboxDir+zipName);
        fs.writeFileSync(tmpDir+".text.txt", data.text);
        fs.writeFileSync(path.join(outboxDir,zipName+"/")+".text.txt", data.text);
        var originalNames = {};
        var randomStr;
        var outboxMessage = {};
        outboxMessage.recipient = data.recipient;
        var attLength = attachments.length;
        for(var i=0; i< attLength; i++)
        {
            randomStr= randomstring.generate({
                charset: 'alphanumeric'
            });
            originalNames[attachments[i]] = randomStr;
            fs.copyFileSync(attachments[i],path.join(outboxDir,zipName+"/")+path.basename(attachments[i]))
        }
        randomStr= randomstring.generate({
            charset: 'alphanumeric'
        });
        originalNames[tmpDir+".text.txt"] = randomStr;
        var messageLog = {};
        messageLog['subject'] = data.subject;
        outboxMessage.subject = data.subject;
        var date = new Date();
        messageLog['date'] = date.getDate() + "." + (date.getMonth()+1) + "." + date.getFullYear() +" " + date.getHours() + ":" + (date.getMinutes() < 10 ? ("0" + date.getMinutes()) : date.getMinutes()  );
        outboxMessage.date = date.getDate() + "." + (date.getMonth()+1) + "." + date.getFullYear() +" " + date.getHours() + ":" + (date.getMinutes() < 10 ? ("0" + date.getMinutes()) : date.getMinutes()  );
        outboxMessage.attachments = [];
        outboxMessage.folder = zipName;
        var att = {};
        Object.keys(originalNames).forEach(function(key) {
            //console.log(key, originalNames[key]);
            if(path.basename(key) !== ".text.txt")
                outboxMessage.attachments.push(path.basename(key));
            att[path.basename(key)] = originalNames[key];
        });
        console.log(outboxMessage);
        messageLog.attachments = att;
        messageLog.sender = (JSON.parse(fs.readFileSync(profileDir+"profile.json"))).userName;
        fs.writeFileSync(path.join(outboxDir,zipName+"/")+".message.json",JSON.stringify(outboxMessage));
        fs.writeFileSync(tmpDir+".message.json",JSON.stringify(messageLog));
        originalNames[tmpDir+".message.json"]=".message.json";
        // replace with find public key from address book
        var addressBook = JSON.parse(fs.readFileSync(addressDir+"addressbook.json"));
        var publicKey;
        for (var i=0; i< addressBook.length; i++)
        {
            if(addressBook[i].email === data.recipient)
            {
                publicKey = fs.readFileSync(addressDir+addressBook[i].key);
                break;
            }

        }
        //publicKey= fs.readFileSync(keyPatch+keyNames[1]);
        // todo
        //here I need to pick publick key from addressbook
        //


        if(!fs.existsSync(outboxDir+"outbox.json"))
            fs.writeFileSync(outboxDir+"outbox.json",JSON.stringify([]));
        var outbox;
        try{
            outbox = JSON.parse(fs.readFileSync(outboxDir+"outbox.json"));
        }
        catch (e) {
            outbox = [];
        }
        outbox.push(outboxMessage);
        fs.writeFileSync(outboxDir+"outbox.json",JSON.stringify(outbox));
        // encrpyt all files and zip them please

        var acc = JSON.parse(fs.readFileSync(profileDir+'profile.json'));
        var token;
        if(acc.token == undefined)
            token = "";
        else
            token = acc.token;

        encryptAndZip(zipName,publicKey,originalNames,data.recipient,token);
        //put here encryption have to redo zipFiles function

        //messageLog['.text.txt'] = randomStr;


    });

}

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
});
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

function getPublicKey(email)
{
    if(validateEmail(email) ===false)
        return null;
    if(! fs.existsSync(addressDir+"addressbook.json"))
        return null;
    try {
        var addressBook = JSON.parse(fs.readFileSync(addressDir+"addressbook.json"));
        var n = addressBook.length;
        for(var i=0; i<n; i++)
        {
            if(addressBook[i].email === email)
                return addressBook[i].key;
        }
        return null;
    }
    catch (e) {
        return null;
    }

}


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
        imap.openBox('INBOX',true,function (err,box)
        {
            if(err)
            {
                console.log(err);
                throw(err);
                return;
            }

        })
    });

    imap.once('error', function(err) {
        console.log(err);
    });

    imap.once('end', function() {
        console.log('Connection ended');
    });

    imap.connect();
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
