/**
 * Created by arpyvanyan on 9/5/14.
 */

var lh = require('../../listhub')({channelId: 'channelId', username: 'username', password: 'pass'});

var xmlDoc = lh.getXml();

lh.getSingleListingJson(xmlDoc.child(1), function(err, json) {
    console.log(JSON.stringify(json));
});
