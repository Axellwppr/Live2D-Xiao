# Live2D-Xiao

## Features
Based on Live2D Cubism 4 SDK for Web and Electron.

## Project Setup

### Install

```bash
$ npm install
# You may encounter some errors when installing iohook, see below
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win
# For macOS
$ npm run build:mac
# For Linux
$ npm run build:linux
```

Note that you may need to build iohook modules manually:
```bash
# Install iohook without building
$ npm install iohook --ignore-scripts

# Build iohook; Node-gyp Python3 and Visual Studio are required
# Open a clean terminal and run the following commands
$ git clone https://github.com/wilix-team/iohook.git
$ cd iohook
$ npm install
$ node build.js --runtime electron --version 21.3.0 --abi 109 --upload=false
# Pay attention to your node-gyp version, you may need to install node-gyp@latest to use visual studio 2022 and later
# Also may need to change the msvc version in build.js manually since iohook didn't update for a long time

# Then copy the zipfile in ./prebuild to node_modules/iohook/builds/electron-109-win32-x64
```