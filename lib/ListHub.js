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
    xml2js = require('xml2js');

// some default values as class constants

ListHub.DEFAULT_FILE_EXT = ".xml.gz";
ListHub.PICKUP_URL = "https://feeds.listhub.com/pickup/";
ListHub.PICKUP_AUTH_URL = "https://{username}:{password}@feeds.listhub.com/pickup/";
ListHub.TMP_DIR = __dirname + "/../.tmp";
ListHub.DATA_FILE_NAME = "data.json";
ListHub.DEFAULT_DATA_JSON = {
    feedLastModifiedDate: 0
};

/**
 * Create and setup ListHub object which collects, stores and manages the corresponding channel's feed.
 * @param options <JSON> contains the following:
 * channelId <string>
 * username <string>
 * password <string>
 * saveAsJson <bool>
 * filename <string>
 * runAt <array>
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

    if(typeof options.filename != 'undefined') {
        this.gzFilename = options.gzFilename + ListHub.DEFAULT_FILE_EXT;
        this.jsonFilename = options.gzFilename + ".json";
        this.xmlFilename = options.gzFilename + ".xml";
    } else {
        this.gzFilename = this.channelId + ListHub.DEFAULT_FILE_EXT;
        this.jsonFilename = this.channelId + ".json";
        this.xmlFilename = this.channelId + ".xml";
    }

//    this.url = ListHub.PICKUP_AUTH_URL.replace("{username}", this.account.username).replace("{password}", this.account.password) + this.channelId + "/" + this.gzFilename;
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

    this.checkAndGetNewFile();

    //set up cron to check for new file on specified times
//    var checkFileJob = new cron.CronJob('00 00 05 * * *', this.checkAndGetNewFile);
    var self = this;

    if(self.runAt) {
        if(_.isString(self.runAt)) {
            try {
                var checkFileJob = new cron.CronJob(self.runAt, self.checkAndGetNewFile);
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
                        var checkFileJob = new cron.CronJob(runAt, self.checkAndGetNewFile);
                        self.cronJobs.push(checkFileJob);
                    } catch(err) {
                        log(ErrorMessages.cronPatternIsInvalid);
                    }
                }
            });
        }
    }
}

ListHub.prototype = {
    /**
     * Check if the feed file was updated for the channel. If so, download and save it.
     * @function
     */
    checkAndGetNewFile: function () {
        var self = this;

        self._checkFeedUpdate(function(err, isUpdated) {
            if(err) {
                log(err);
                return;
            }

            if(!isUpdated) {
                return;
            }

            //if feed file was updated, then download and save it
            self._saveNewFeedFiles(function(err) {
                if(err) {
                    log(err);
                }
            });
        });
    },

    /**
     * clear all downloaded filed for the channel (gz, xml, json)
     * @function
     */
    clearFeedFiles: function () {
        var self = this;
        fs.unlink(self.gzFeedFile, function(err) {
            if(err) {
                log(ErrorMessages.failedToRemoveFeedFiles);
                return false;
            }

            fs.unlink(self.xmlFeedFile, function(err) {
                if(err) {
                    log(ErrorMessages.failedToRemoveFeedFiles);
                    return false;
                }

                if(self.saveAsJson) {
                    fs.unlink(self.jsonFeedFile, function(err) {
                        if(err) {
                            log(ErrorMessages.failedToRemoveFeedFiles);
                            return false;
                        }

                        return true;
                    })
                } else {
                    return true;
                }
            })
        })
    },

    /**
     * get latest feed as json object
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
     * get latest feed as xml string
     * @returns {string}
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
     */
    _checkFeedUpdate: function(cb) {
        var self = this;

        console.log(this.url);
        request.head(this.url, {auth: {user: this.account.username, pass: this.account.password}}, function(err, res, body) {
            if(err) {
                log(ErrorMessages.headRequestErrorOccurred + res.statusCode);
                return cb(err)
            }

            if(res.statusCode == 200) {
                //check last update date

                var lastFetchedDate = self._getLastFetchedDate();
                var lastModifiedDate = res.headers['last-modified'];

                console.log(lastModifiedDate);
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
     */
    _saveUncompressedFeed: function (cb) {
        var self = this;

        var readStream = fs.createReadStream(self.gzFeedFile);
        var tmpFile = self.channelFilesDir + "tmp_xml_" + Date.now() + ".xml";
        var writeStream = fs.createWriteStream(tmpFile);

        readStream.pipe(zlib.createGunzip()).pipe(writeStream);

        readStream.on("error", function(err) {
            log(err);
            return cb(err);
        });

        writeStream.on("error", function(err) {
            log(err);
            return cb(err);
        });

        writeStream.on("finish", function(err) {

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
     * convert feed xml to json and saves it
     * @param cb
     * @private
     */
    _saveFeedAsJson: function(cb) {
        var self = this;
        var parser = xml2js.Parser();

        fs.readFile(self.xmlFeedFile, function(err, data) {
            if(err) {
                return cb(err);
            }
            
            parser.parseString(data, function(err, json) {
                if(err) {
                    return cb(err);
                }
                
                var tmpFile = self.channelFilesDir + "tmp_json_" + Date.now() + ".json";
                
                fs.writeFile(tmpFile, JSON.stringify(json), function(err) {
                    if(err) {
                        return cb(err);
                    }

                    if(fs.existsSync(self.jsonFeedFile)) {
                        fs.unlink(self.jsonFeedFile, function (err) {
                            if(err) {
                                return cb(err);
                            }

                            fs.rename(tmpFile, self.jsonFeedFile, function (err) {
                                if(err) {
                                    return cb(err);
                                }

                                return cb(null)
                            })
                        })
                    } else {
                        fs.rename(tmpFile, self.jsonFeedFile, function (err) {
                            if(err) {
                                return cb(err);
                            }

                            return cb(null)
                        })
                    }
                })
            })
        })
    },

    /**
     * get the timestamp of latest saved feed file
     * @returns {*}
     * @private
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