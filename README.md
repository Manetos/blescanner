A cross-platform BLE Scanner developed with Meteor.js and Cordova.

# Android
Even though cordova is cross-platform, I have only tested it with Android yet.  

## Setup
https://www.meteor.com/tutorials/blaze/running-on-mobile

## Running

```
//local server
meteor run android-device -p <local port>  # meteor server is spawned on your computer

//production server
meteor run android-device -v --mobile-server <remote server>
```


TODO
* Enable BLE if it is disabled on the phone
* Replace javascript alerts with Bootstrap alerts.
