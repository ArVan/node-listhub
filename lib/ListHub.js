/**
 * Created by arpyvanyan on 9/4/14.
 */


var
    _            = require('lodash'),
    fs            = require('fs'),
    mkpath        = require('mkpath'),
    request       = require('request'),
    cron          = require('cron'),
    log           = require('debug')('ListHub'),
    zlib = require('zlib'),
    libxmljs = require("libxmljs");

// some default values as class constants

ListHub.DEFAULT_FILE_EXT = ".xml.gz";
ListHub.PICKUP_URL = "https://feeds.listhub.com/pickup/";
ListHub.TMP_DIR = __dirname + "/../.tmp";
ListHub.DATA_FILE_NAME = "data.json";
ListHub.DEFAULT_DATA_JSON = {
    feedLastModifiedDate: 0
};

/**
 * Create and setup ListHub object which collects, stores and manages the corresponding channel's feed.
 * @param options {JSON} contains the following:
 * channelId {string}
 * username {string}
 * password {string}
 * saveAsJson {bool}
 * filename {string}
 * runAt {array}
 * setCron {bool}
 * runCronAtOnce {bool}
 * onCronComplete {function}
 *
 * @returns {ListHub}
 * @constructor
 *
 * @since 0.0.1
 */
function ListHub (options) {

    if (!(this instanceof ListHub)) {
        return new ListHub(options);
    }

    this.cronJobs = [];
    this.account = {username: options.username, password: options.password};
    this.channelId = options.channelId;
    this.saveAsJson = options.saveAsJson;
    this.runAt = options.runAt;
    this.setCron = typeof options.setCron != 'undefined' ? options.setCron : false;
    this.runCronAtOnce = typeof options.runCronAtOnce != 'undefined' ? options.runCronAtOnce : false;
    this.onCronComplete = options.onCronComplete != 'undefined' ? options.onCronComplete : null;

    if(typeof options.filename != 'undefined') {
        this.gzFilename = options.gzFilename + ListHub.DEFAULT_FILE_EXT;
        this.jsonFilename = options.gzFilename + ".json";
        this.xmlFilename = options.gzFilename + ".xml";
    } else {
        this.gzFilename = this.channelId + ListHub.DEFAULT_FILE_EXT;
        this.jsonFilename = this.channelId + ".json";
        this.xmlFilename = this.channelId + ".xml";
    }

    this.url = ListHub.PICKUP_URL + this.channelId + "/" + this.gzFilename;
    this.channelFilesDir = ListHub.TMP_DIR + "/" + this.channelId;
    this.dataFile = this.channelFilesDir + "/" + ListHub.DATA_FILE_NAME;
    this.gzFeedFile = this.channelFilesDir + "/" + this.gzFilename;
    this.xmlFeedFile = this.channelFilesDir + "/" + this.xmlFilename;
    this.jsonFeedFile = this.channelFilesDir + "/" + this.jsonFilename;

    //create initial tmp file with channel fetch data
    if(!fs.existsSync(this.dataFile)) {
        try {
            mkpath.sync(this.channelFilesDir);
            fs.writeFileSync(this.dataFile, JSON.stringify(ListHub.DEFAULT_DATA_JSON, null, 4));
        } catch (e) {
            log(e.message);
            return null;
        }
    }

    //todo add condition to run code immediately after start.
//    this.checkAndGetNewFile();

    //set up cron to check for new file on specified times
    var self = this;

    if(self.setCron) {
        if(self.runAt) {
            if(_.isString(self.runAt)) {
                try {
                    var checkFileJob = new cron.CronJob(self.runAt, self.checkAndGetNewFile, self.onCronComplete, self.runCronAtOnce);
                    self.cronJobs.push(checkFileJob);
                } catch(err) {
                    log(ErrorMessages.cronPatternIsInvalid);
                }
            }
            if(_.isArray(self.runAt)) {
                _.forEach(self.runAt, function(runAt) {
                    if(!_.isString(runAt)) {
                        log(ErrorMessages.cronPatternIsInvalid);
                    } else {
                        try {
                            var checkFileJob = new cron.CronJob(runAt, self.checkAndGetNewFile, self.onCronComplete, self.runCronAtOnce);
                            self.cronJobs.push(checkFileJob);
                        } catch(err) {
                            log(ErrorMessages.cronPatternIsInvalid);
                        }
                    }
                });
            }
        } else {
            var checkFileJob = new cron.CronJob('00 00 00 * * *', self.checkAndGetNewFile, self.onCronComplete, self.runCronAtOnce);
            self.cronJobs.push(checkFileJob);
        }
    }
}

ListHub.prototype = {
    /**
     * Check if the feed file was updated for the channel. If so, download and save it.
     * @function
     * @param cb {Function}
     *
     * @since 0.0.1
     */
    checkAndGetNewFile: function (cb) {
        var self = this;

        self._checkFeedUpdate(function(err, isUpdated) {
            if(err) {
                log(err);
                if(typeof cb != 'undefined') {
                    return cb(err);
                }
            }

            if(!isUpdated) {
                if(typeof cb != 'undefined') {
                    return cb();
                }
            }

            //if feed file was updated, then download and save it
            self._saveNewFeedFiles(function(err) {
                if(err) {
                    log(err);
                    if(typeof cb != 'undefined') {
                        return cb(err);
                    }
                }
                if(typeof cb != 'undefined') {
                    return cb();
                }
            });
        });
    },

    /**
     * clear all downloaded filed for the channel (gz, xml, json)
     * @function
     * @param cb {Function}
     *
     * @since 0.0.1
     */
    clearFeedFiles: function (cb) {
        var self = this;
        fs.unlink(self.gzFeedFile, function(err) {
            if(err) {
                log(ErrorMessages.failedToRemoveFeedFiles);
                return cb(err);
            }

            fs.unlink(self.xmlFeedFile, function(err) {
                if(err) {
                    log(ErrorMessages.failedToRemoveFeedFiles);
                    return cb(err);
                }

                if(self.saveAsJson) {
                    fs.unlink(self.jsonFeedFile, function(err) {
                        if(err) {
                            log(ErrorMessages.failedToRemoveFeedFiles);
                            return cb(err);
                        }

                        return cb();
                    })
                } else {
                    return cb();
                }
            })
        })
    },

    /**
     * Get json representation of single Listing
     * @param listingXml {Element}
     * @param cb
     * @returns {json}
     *
     * @since v0.0.3
     */
    getSingleListingJson: function(listingXml, cb) {
        var Element = require('libxmljs/lib/element');

        if(!(listingXml instanceof Element)) {
            return cb(new TypeError(ErrorMessages.propertyMustBeInstanceOfLibxmjsElement));
        }

        if(listingXml.name() != 'Listing') {
            return cb(new Error(ErrorMessages.propertyIsNotSingleListing));
        }

        var parseString = require('xml2js').parseString;

        parseString(listingXml, function (err, result) {
            if(err) {
                log(err);
                return cb(err);
            }

            return cb(null, result);
        });
    },

    /**
     * get latest feed as json object
     * @ignore
     * @returns {null|json}
     */
    getJson: function() {
        var self = this;

        if(!fs.existsSync(self.jsonFeedFile)) {
            return null;
        }

        fs.readFile(self.jsonFeedFile, function(err, data) {
            if(err) {
                log(err);
                return null;
            }

            return JSON.parse(data);
        });
    },

    /**
     * get latest feed as json string
     * @ignore
     * @returns {string}
     */
    getJsonString: function() {
        var self = this;

        if(!fs.existsSync(self.jsonFeedFile)) {
            return '';
        }

        fs.readFile(self.jsonFeedFile, function(err, data) {
            if(err) {
                log(err);
                return '';
            }

            return data;
        });
    },

    /**
     * get latest feed as xmlDoc object
     * @returns {Document}
     *
     * @since 0.0.2
     */
    getXml: function() {
        var self = this;

        try{
            var data = fs.readFileSync(self.xmlFeedFile);
            console.log("read xml file");

            var xmlDoc = libxmljs.parseXmlString(data, { noblanks: true });
            return xmlDoc;
        } catch (err) {
            console.error(err);
            return null;
        }
    },

    /**
     * get latest feed as xml string
     * @returns {string}
     *
     * @since 0.0.1
     */
    getXmlString: function() {
        var self = this;

        if(!fs.existsSync(self.xmlFeedFile)) {
            return '';
        }

        fs.readFile(self.xmlFeedFile, function(err, data) {
            if(err) {
                log(err);
                return '';
            }

            return data;
        });
    },

    /**
     * check for new file via HEAD request.
     * @param cb
     * @private
     *
     * @since 0.0.1
     */
    _checkFeedUpdate: function(cb) {
        var self = this;

        request.head(this.url, {auth: {user: this.account.username, pass: this.account.password}}, function(err, res, body) {
            if(err) {
                log(ErrorMessages.headRequestErrorOccurred + res.statusCode);
                return cb(err)
            }

            if(res.statusCode == 200) {
                //check last update date

                var lastFetchedDate = self._getLastFetchedDate();
                var lastModifiedDate = res.headers['last-modified'];

                log('last modified: ' + lastModifiedDate);

                lastModifiedDate = new Date(lastModifiedDate).getTime();

                if(lastFetchedDate < lastModifiedDate) {
                    return cb(null, true);
                }
            }

            return cb(null, false);
        })
    },

    /**
     * download and save latest feed xml.gz file.
     * Also extracts and saves xml separately.
     * @param cb
     * @private
     *
     * @since 0.0.1
     */
    _saveNewFeedFiles: function (cb) {
        var self = this;

        var tmpFile = this.channelFilesDir + "/tmp_" + Date.now();
        var writeStream = fs.createWriteStream(tmpFile);
        var lastModifiedDate = 0;

        request.get(this.url, {auth: {user: this.account.username, pass: this.account.password}})
            .on("response", function (res) {
                lastModifiedDate = res.headers['last-modified'];
                lastModifiedDate = new Date(lastModifiedDate).getTime();
            })
            .pipe(writeStream);

        writeStream.on("error", function (err) {
            return cb(err);
        });

        writeStream.on("finish", function (err) {
            //todo handle error response
            if(fs.existsSync(self.gzFeedFile)) {
                fs.unlink(self.gzFeedFile, function (err) {
                    if(err) {
                        return cb(err);
                    }

                    return self._renameFeedFileAndHandler(tmpFile, lastModifiedDate, cb);
                })
            } else {
                return self._renameFeedFileAndHandler(tmpFile, lastModifiedDate, cb);
            }
        });
    },

    /**
     * unpack downloaded zip file to xml
     * @param cb
     * @private
     *
     * @since 0.0.1
     */
    _saveUncompressedFeed: function (cb) {
        var self = this;

        var readStream = fs.createReadStream(self.gzFeedFile);
        var tmpFile = self.channelFilesDir + "/tmp_xml_" + Date.now() + ".xml";
        var writeStream = fs.createWriteStream(tmpFile);

        readStream.pipe(zlib.createGunzip()).pipe(writeStream);

        readStream.on("error", function(err) {
            console.error(err);
            log(err);
            return cb(err);
        });

        writeStream.on("error", function(err) {
            console.error(err);
            log(err);
            return cb(err);
        });

        writeStream.on("finish", function(err) {
            console.log("finished unsip");
            if(fs.existsSync(self.xmlFeedFile)) {
                fs.unlink(self.xmlFeedFile, function (err) {
                    if(err) {
                        return cb(err);
                    }

                    fs.rename(tmpFile, self.xmlFeedFile, function (err) {
                        if(err) {
                            return cb(err);
                        }

                        return cb(null)
                    })
                })
            } else {
                fs.rename(tmpFile, self.xmlFeedFile, function (err) {
                    if(err) {
                        return cb(err);
                    }

                    return cb(null)
                })
            }
        });
    },

    /**
     * @todo implement this later
     * @param cb
     * @private
     */
    _saveFeedAsJson: function(cb) {

    },

    /**
     * get the timestamp of latest saved feed file
     * @returns {*}
     * @private
     *
     * @since 0.0.1
     */
    _getLastFetchData: function () {
        var self = this;

        try {
            var data = fs.readFileSync(self.dataFile);
            data = JSON.parse(data);

            if(!data) {
                return ListHub.DEFAULT_DATA_JSON;
            }

            return JSON.parse(data);

        } catch (err) {
            log(err);
            return ListHub.DEFAULT_DATA_JSON;
        }
    },

    /**
     * get the date of last updated feed
     * @returns {number}
     * @private
     *
     * @since 0.0.1
     */
    _getLastFetchedDate: function () {
        var self = this;
        return self._getLastFetchData().feedLastModifiedDate;
    },

    /**
     * update the last fetched file's modified date in data
     * @param newDate
     * @returns {boolean}
     * @private
     *
     * @since 0.0.1
     */
    _setLastFetchedDate: function (newDate) {
        var self = this;

        var currentData = self._getLastFetchData();
        currentData.feedLastModifiedDate = newDate;

        try {
            fs.writeFileSync(self.dataFile, JSON.stringify(ListHub.DEFAULT_DATA_JSON, null, 4));
        } catch (err) {
            log(err);
            return false;
        }
        return true;
    },

    /**
     * rename tmp feed file handler
     * @param tmpFile
     * @param lastModifiedDate
     * @param cb
     * @private
     *
     * @since 0.0.1
     */
    _renameFeedFileAndHandler: function (tmpFile, lastModifiedDate, cb) {
        var self = this;
        
        fs.rename(tmpFile, self.gzFeedFile, function (err) {
            if(err) {
                return cb(err);
            }

            self._saveUncompressedFeed(function(err) {
                if(err) {
                    return cb(err);
                }

                //update last modified date in data file

                if(lastModifiedDate) {
                    self._setLastFetchedDate(lastModifiedDate);
                }

                if(self.saveAsJson) {
                    self._saveFeedAsJson(function(err) {
                        if(err) {
                            return cb(err);
                        }
                        return cb(null)
                    });    
                } else {
                    return cb(null)
                }
            });
        })
    }
};

module.exports = ListHub;