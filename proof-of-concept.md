# Proof of Concept
## Running secure mailing app, nodejs and npm on Tails OS

1. Install Tails OS:
    <br>https://tails.boum.org/install/win/usb-overview/index.en.html

2. Follow optional step (7/7) to create an encrypted persistent storage.

3. In Tails Greeter unlock encrypted persistent storage.

4. In Tails Greeter click on `+` at the bottom left corner of the window and choose a root password.

5. Start Tails.

6. From https://nodejs.org/en/download/ download nodejs LTS Linux Binaries (x64):
    <br>https://nodejs.org/dist/v10.13.0/node-v10.13.0-linux-x64.tar.xz

7. cd to the download folder.

8. Install nodejs and npm:
```sh
$ sudo tar -C /usr/local --strip-components 1 -xJf node-v10.13.0-linux-x64.tar.xz
```

9. Verify successful installation:
```sh
$ node -v
    v10.13.0 
$ npm -v
    6.4.1
```

10. Clone repository or download .zip from github and unpack:
```sh
$ git clone https://github.com/bbbalu/secure_mailing_school_pgp.git
```

11. Download zipped packages from https://goo.gl/E7AxJi and unzip the archive into secure_mailing_school_pgp/node_modules.

12. cd to secure_mailing_school_pgp and start the secure mailing app:
```sh
$ npm start
```
