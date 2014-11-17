/**
 * Created by arpyvanyan on 9/4/14.
 */


var   _            = require('lodash')
    , fs            = require('fs')
    , lockFile       = require('lockfile')
    , log           = require('debug')('ListHub')
    , request       = require('request')
    ;

// some default values as class constants

ListHub.DATA_FILE_NAME = "data.json";
ListHub.DEFAULT_FILE_EXT = ".xml.gz";
ListHub.DEFAULT_TMP_DIR = __dirname + "/../.tmp";
ListHub.DEFAULT_DATA_JSON = {
    feedLastModifiedDate: 0
};
ListHub.PICKUP_URL = "https://feeds.listhub.com/pickup/";
ListHub.LOCK_FILE = __dirname + "/../process.lock";

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
 * tmpDir {string}
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

    if(_.isUndefined(options.username) || _.isUndefined(options.password)) {
        throw new Error(ErrorMessages.missingUsernameOrPassword);
    }

    if(_.isUndefined(options.channelId)) {
        throw new Error(ErrorMessages.missingChannelId);
    }

    //set up class statics depending on provided constructor options

    this.account = {username: options.username, password: options.password};
    this.channelId = options.channelId;
    this.cronJobs = [];
    this.onCronComplete = !_.isUndefined(options.onCronComplete) ? options.onCronComplete : null;
    this.runAt = !_.isUndefined(options.runAt) ? options.runAt : null;
    this.runCronAtOnce = !_.isUndefined(options.runCronAtOnce) ? options.runCronAtOnce : false;
    this.saveAsJson = options.saveAsJson;
    //this.setCron = !_.isUndefined(options.setCron) ? options.setCron : false;
    this.tmpDir = !_.isUndefined(options.tmpDirectory) ? options.tmpDirectory : ListHub.DEFAULT_TMP_DIR;

    if(!_.isUndefined(options.filename)) {
        this.gzFilename = options.gzFilename + ListHub.DEFAULT_FILE_EXT;
        this.jsonFilename = options.gzFilename + ".json";
        this.xmlFilename = options.gzFilename + ".xml";
    } else {
        this.gzFilename = this.channelId + ListHub.DEFAULT_FILE_EXT;
        this.jsonFilename = this.channelId + ".json";
        this.xmlFilename = this.channelId + ".xml";
    }

    this.url = ListHub.PICKUP_URL + this.channelId + "/" + this.gzFilename;
    this.channelFilesDir = this.tmpDir + "/" + this.channelId;
    this.dataFile = this.channelFilesDir + "/" + ListHub.DATA_FILE_NAME;
    this.gzFeedFile = this.channelFilesDir + "/" + this.gzFilename;
    this.xmlFeedFile = this.channelFilesDir + "/" + this.xmlFilename;
    this.jsonFeedFile = this.channelFilesDir + "/" + this.jsonFilename;
    this.errorFile = this.channelFilesDir + "/error.txt";

    //create initial tmp file with channel fetch data
    if(!fs.existsSync(this.dataFile)) {
        try {
            var mkpath = require('mkpath');
            mkpath.sync(this.channelFilesDir);
            mkpath = null;
            fs.writeFileSync(this.dataFile, JSON.stringify(ListHub.DEFAULT_DATA_JSON, null, 4));
        } catch (e) {
            log(e.message);
            return null;
        }
    }

    //set up cron to check for new file on specified times
    var self = this;

    if(self.setCron) {
        var cron = require('cron');
        if(self.runAt) {
            if(_.isString(self.runAt)) {
                try {
                    var checkFileJob = new cron.CronJob(self.runAt, self.checkAndGetNewFile, self.onCronComplete, self.runCronAtOnce);
                    checkFileJob.start();
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
                            checkFileJob.start();
                            self.cronJobs.push(checkFileJob);
                        } catch(err) {
                            log(ErrorMessages.cronPatternIsInvalid);
                        }
                    }
                });
            }
        } else {
            var checkFileJob = new cron.CronJob('00 00 00 * * *', self.checkAndGetNewFile, self.onCronComplete, self.runCronAtOnce);
            checkFileJob.start();
            self.cronJobs.push(checkFileJob);
        }
    } else {
        if(self.runCronAtOnce) {
            self.checkAndGetNewFile(self.onCronComplete);
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


        lockFile.check(ListHub.LOCK_FILE, {}, function (err, isLocked) {
            if(err) {
                if(_.isFunction(cb)) {
                    return cb(err);
                } else {
                    return;
                }
            }

            if(isLocked) {
                if(_.isFunction(cb)) {
                    return cb();
                } else {
                    return;
                }
            }

            lockFile.lock(ListHub.LOCK_FILE, {}, function (err) {
                if(err) {
                    lockFile.unlock(ListHub.LOCK_FILE, function (error) {
                        if(error) {
                            if(_.isFunction(cb)) {
                                return cb(error);
                            } else {
                                return;
                            }
                        }
                        if(_.isFunction(cb)) {
                            return cb(err);
                        } else {
                            return;
                        }
                    });
                    return;
                }

                self._checkFeedUpdate(function(err, isUpdated) {
                    if(err) {
                        lockFile.unlock(ListHub.LOCK_FILE, function (error) {
                            if(error) {
                                if(_.isFunction(cb)) {
                                    return cb(error);
                                } else {
                                    return;
                                }
                            }
                            if(_.isFunction(cb)) {
                                return cb(err);
                            } else {
                                return;
                            }
                        });
                        return;
                    }

                    if(!isUpdated) {
                        lockFile.unlock(ListHub.LOCK_FILE, function (error) {
                            if(error) {
                                if(_.isFunction(cb)) {
                                    return cb(error);
                                } else {
                                    return;
                                }
                            }
                            if(_.isFunction(cb)) {
                                return cb();
                            } else {
                                return;
                            }
                        });
                        return;
                    }

                    //if feed file was updated, then download and save it
                    self._saveNewFeedFiles(function(err) {
                        if(err) {
                            lockFile.unlock(ListHub.LOCK_FILE, function (error) {
                                if(error) {
                                    if(_.isFunction(cb)) {
                                        return cb(error);
                                    } else {
                                        return;
                                    }
                                }
                                if(_.isFunction(cb)) {
                                    return cb(err);
                                } else {
                                    return;
                                }
                            });
                            return;
                        }

                        lockFile.unlock(ListHub.LOCK_FILE, function (err) {
                            if(err) {
                                if(_.isFunction(cb)) {
                                    return cb(err);
                                } else {
                                    return;
                                }
                            }
                            if(_.isFunction(cb)) {
                                return cb();
                            } else {
                                return;
                            }
                        });

                    });
                });
            })
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
            Element = null;
            parseString = null;

            if(err) {
                log(err);
                return cb(err);
            }

            return cb(null, result);
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

            var libxmljs = require("libxmljs");
            var xmlDoc = libxmljs.parseXmlString(data, { noblanks: true });
            data = null;
            libxmljs = null;
            self = null;
            return xmlDoc;
        } catch (err) {
            log(err);
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

        request.head(self.url, {auth: {user: self.account.username, pass: self.account.password}}, function(err, res, body) {
            if(err) {
                log(ErrorMessages.headRequestErrorOccurred + res.statusCode);
                return cb(err)
            }

            if(res.statusCode == 200) {
                //check last update date

                var lastFetchedDate = self._getLastFetchedDate();
                var lastModifiedDate = res.headers['last-modified'];

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

        var tmpFile = this.channelFilesDir + "/tmp_" + Date.now(),
            writeStream = fs.createWriteStream(tmpFile);
        var lastModifiedDate = 0,
            isErrorResponse = false;

        request.get(self.url, {auth: {user: self.account.username, pass: self.account.password}})
            .on("response", function (res) {
                if(res.statusCode == 200 && res.headers['content-type'] == 'application/x-gzip') {
                    lastModifiedDate = res.headers['last-modified'];
                    lastModifiedDate = new Date(lastModifiedDate).getTime();
                } else {
                    isErrorResponse = true;
                }
            })
            .pipe(writeStream);

        writeStream.on("error", function (err) {
            return cb(err);
        });

        writeStream.on("finish", function (err) {
            if(err) {
                return cb(err);
            }

            if(isErrorResponse) {
                log(ErrorMessages.listHubError);

                if(fs.existsSync(self.errorFile)) {
                    fs.unlink(self.errorFile, function (err) {
                        if(err) {
                            return cb(err);
                        }

                        return self._renameErrorFileHandler(tmpFile, cb);
                    })
                } else {
                    return self._renameErrorFileHandler(tmpFile, cb);
                }
            } else {
                if(fs.existsSync(self.gzFeedFile)) {
                    fs.unlink(self.gzFeedFile, function (err) {
                        if(err) {
                            return cb(err);
                        }

                        return self._renameFeedFilesHandler(tmpFile, lastModifiedDate, cb);
                    })
                } else {
                    return self._renameFeedFilesHandler(tmpFile, lastModifiedDate, cb);
                }
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

        var zlib = require('zlib');

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
            zlib = null;
            console.log("finished unzip");
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
     * get the timestamp of latest saved feed file
     * @returns {*}
     * @private
     *
     * @since 0.0.1
     */
    _getLastFetchData: function () {
        var self = this;

        try {
            var data = fs.readFileSync(self.dataFile, "utf8");
            data = JSON.parse(data);
            if(!data) {
                return ListHub.DEFAULT_DATA_JSON;
            }
            return data;
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
            fs.writeFileSync(self.dataFile, JSON.stringify(currentData, null, 4));
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
    _renameFeedFilesHandler: function (tmpFile, lastModifiedDate, cb) {
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

                return cb();
            });
        })
    },

    /**
     * rename tmp feed error file handler
     * @param tmpFile
     * @param cb
     * @private
     *
     * @since 0.0.8-rc3
     */
    _renameErrorFileHandler: function (tmpFile, cb) {
        var self = this;

        fs.rename(tmpFile, self.errorFile, function (err) {
            if(err) {
                return cb(err);
            }
            return cb();
        })
    }
};

module.exports = ListHub;