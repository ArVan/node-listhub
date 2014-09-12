# node-listhub

A Node.js module to handle ListHub feed downloads

# Installation

Via [npm][]:

    $ npm install listhub

# Changelog

## v0.0.4

- Added constructor option `runCronAtOnce` to start cronJob immediately
- Added constructor option `onCronComplete` which is a callback function executed each time the job is complete


## v0.0.3

- Added `getSingleListingJson()` method, which returns the `JSON` representations of a single Listing.
- Added ability to tell the constructor whether to set up cron jobs or no. Don by passing `{setCron: true, ...}` option to constructor.

## v0.0.2

- Added `getXml()` method, which returns [libxmljs][] Document object to easily perform queries. 

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

	+ gzFeedFile               The path of downloaded `gzip` file 
	+ xmlFeedFile              The path of extracted `xml` file
	+ channelFilesDir          The directory path where all channel files are kept

### Methods

	+ constructor(options)
	+ checkAndGetNewFile(cb)                      You can manually run the feed update script with this function
	+ getXml()                                    Returns the parsed xml as libxml Document object
	+ getXmlString()                              Returns the string of parsed xml
	+ getSingleListingJson(listingXmlElement, cb) Returns json object representing single Listing
	+ clearFeedFiles(cb)                          Remove all files related to the channel (gzip, xml)

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