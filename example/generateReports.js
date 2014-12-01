/**
 * Created by arpyvanyan on 9/5/14.
 */

var async = require('async');

/**
 *
 * @type {*|ListHub|exports}
 */
var lh = require('../../listhub')({
    channelId: 'channelId',
    username: 'username',
    password: 'password'
});

lh.checkAndGetNewFile(onComplete);

function onComplete(err) {
    if(err) {
        console.log(err);
    }

    var xmlDoc = lh.getXml();

    if (!xmlDoc) {
        sails.log.error(new Error('Failed to parse xml!'));
    }

    var listings = xmlDoc.childNodes();

    var i = 0;
    async.eachLimit(listings, 1, function(listing, callback) {
        console.log('listing ' + (++i));
        lh.getSingleListingJson(listing, function (err, json) {
            var listingJson = json.Listing;

            lh.addStatusReportForListing(listingJson['ListingKey'][0], 'SUCCESS', 'url of listing ' + i, 'Successfully imported listing ' + i, "YYYY-MM-DD HH:mm:ss ZZ", function(err) {
                if(err) {
                    return callback(err);
                }

                return callback();
            })
        });


    }, function(err) {
        if(err) {
            console.log(err);
        }

        lh.generateReportFile(function(err) {
            if(err) {
                console.log(err);
            }

            console.log('all done');
        });
    })
}