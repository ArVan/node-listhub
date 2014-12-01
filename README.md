# node-listhub

A Node.js module to handle ListHub feed downloads

# Installation

Via [npm][]:

    $ npm install listhub

# Changelog

## v1.0.0

- Added report creation support

[older change log](./CHANGELOG.md)

# Quick start

Below is the simple usage of this module. Just require the object, initialise and use it.

```JavaScript
var lh = require('listhub')({channelId: 'channelId', username: 'username', password: 'pass'});
```

Below you can find more detailed usage tips and examples.

# Usage

## Class reference

### Properties

	+ gzFeedFile               The path of downloaded `gzip` file 
	+ xmlFeedFile              The path of extracted `xml` file
	+ channelFilesDir          The directory path where all channel files are kept

### Methods

	+ constructor(options)
	+ checkAndGetNewFile(cb)                                                     You can manually run the feed update script with this function
	+ getXml()                                                                   Returns the parsed xml as libxml Document object
	+ getXmlString()                                                             Returns the string of parsed xml
	+ getSingleListingJson(listingXmlElement, cb)                                Returns json object representing single Listing
	+ clearFeedFiles(cb)                                                         Remove all files related to the channel (gzip, xml)
	+ addStatusReportForListing(listingKey, status, url, message, timestamp, cb) Add status report for a listing
	+ generateReportFile(cb)                                                     Generate final report file for previously added statuses

## Creating class object

To get started with ListHub, the class object should be created with initial options. Here is an example:

```JavaScript
var listHub = require('listhub')({channelId: 'channelId', username: 'username', password: 'pass'});
```

The constructor takes 1 argument (options). It is an object with some configuration parameters. 
The possible contents of the object are:

```
channelId <string>        Your ListHub channel
username <string>         The username for your ListHub account
password <string>         The password for your ListHub account
filename <string>         An optional filename to apply to saved files. If not provided, the channelId will be used
runAt <string|array>      An array containing cron-formatted strings to use for running cron jobs.
setCron <boolean>         A boolean indicating if the constructor should set up cron jobs to get ListHub files
runCronAtOnce <boolean>   Indicates if the feed should be downloaded also immediately after setup
onCronComplete <function> Function to run at cron job completion
tmpDirectory <string>     Path to temp directory where feed files will be kept
reportFilePath <string>   Path to reports file to save for ListHub. If not specified will be equal to '{tmpDirectory}/{channelId}/report.xml'
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

When the listHub is set up, you can call some methods on it like:

```JavaScript
var xmlDoc = lh.getXml();
lh.getSingleListingJson(xmlDoc.child(1), function(err, json) {
    //handle error here
    console.log(JSON.stringify(json));
});
```
 
[npm]: https://www.npmjs.org/package/listhub
[libxmljs]: https://github.com/polotek/libxmljs