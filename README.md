# node-listhub

A Nodej.s module to handle ListHub feed downloads

# Installation

Via [npm][]:

    $ npm install listhub

# Changelog

## v0.0.1

- Setup ListHub to download and store your feed file
- Saves the `gzipped` file
- Extracts `xml` file
- Provides some handy functions to read and return the xml as string
- Setts up cron jobs to retrieve the feed on specified time


# Quick start

Below is the simple usage of this module. Just require the object, initialise and use it.

```JavaScript
var lh = require('listhub')({channelId: 'channelId', username: 'username', password: 'pass'});
```

Below you can find more detailed usage tips and examples.

# Usage

## Class reference

### Properties

	gzFeedFile               The path of downloaded `gzip` file 
	xmlFeedFile              The path of extracted `xml` file
	channelFilesDir          The directory path where all channel files are kept

### Methods

	- constructor(options)
	- checkAndGetNewFile()   You can manually run the feed update script with this function
	- getXmlString()         Returns the string of parsed xml
	- clearFeedFiles()       Remove all files related to the channel (gzip, xml)

## Creating class object

 To get started with ListHub, the class object should be created with initial options. Here is an example:

 ```JavaScript
 var listHub = require('listhub')({channelId: 'channelId', username: 'username', password: 'pass'});
 ```

 The constructor takes 1 argument (options). It is an object with some configuration parameters. 
 The possible contents of the object are:

 ```
 channelId <string> Your ListHub channel
 username <string> The username for your ListHub account
 password <string> The password for your ListHub account
 filename <string> An optional filename to apply to saved files. If not provided, the channelId will be used
 runAt <string|array> An array containing cron-formatted strings to use for running cron jobs.
 ```
 
 If no `runAt` is provided, the module will download and store the feed file every day at `00:00:00`.
 If you want to specify your own schedule you can provide your time in cron format.
  
 Example:
  
 ```JavaScript
 var listHub = require('listhub')({runAt: '00 00 07 * * *', ...});
 ```  
 
 If you want to run the script lets say several times a day, you provide an array:
 
 ```JavaScript
 var listHub = require('listhub')({runAt: ['00 00 00 * * *', '00 00 06 * * *', '00 00 12 * * *'], ...});
 ```  
  
  
[npm]: https://npmjs.org