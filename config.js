Devices = new Mongo.Collection(null);
Services = new Mongo.Collection(null);

var SERVICE_UUIDS = {
    '1800' : 'Generic Access',
    '1801' : 'Generic Attribute',
    '180F' : 'Battery Service',
    'dddd5678-1234-5678-1234-56789dddddd0': 'Config'
};

var CHARACTERISTICS_UUIDs = {
    '2902' : 'Client Characteristic Configuration',
    '2a00' : 'Device Name',
    '2A19' : 'Battery Level',
    'dddd5678-1234-5678-1234-56789dddddd1': 'WIFI',
    'dddd5678-1234-5678-1234-56789dddddd2' : 'URL'
};

//Chars in config service is treated differently:
//in case of write, notifications are enabled automatically
var ConfigServiceUUID = 'dddd5678-1234-5678-1234-56789dddddd0';

function str2Bytes(str) {
    //Somehow Buffer does not work so had to do it this way
    var bytes = new Uint8Array(str.length);
    for (var i = 0; i < str.length; ++i) {
        bytes[i] = str.charCodeAt(i);
    }
    return bytes;
}

if (Meteor.isClient) {
    Template.body.helpers({
        devices: function () {
            console.log('Dodo', Devices);
            return Devices.find();
        },

        selectedDevice: function () {
            var device = Devices.findOne(getSelectedDeviceId());
            return device;
        }
    });
    Template.deviceConnection.helpers({
        isConnected: function () {
            return this.state === 'Connected';
        },

        services: function () {
            return Services.find();
        }
    });

    Template.body.events({
        'click #refreshButton': function(){
            console.log('You clicked refresh');

            Devices.remove({});
            ble.scan([], 5, onDiscoverDevice, onBleError);
        }
    });

    Template.device.events({
        'click #connectButton': function(){
            var self = this;
            Services.remove({});
            Session.set('selectedDeviceId', self.id);

            console.log('You clicked connect %j', this._id);

            updateDevice(this._id, {state: 'Connecting'});

            ble.connect(this._id, onConnect.bind(this), onBleError);

            return false;
        }
    });

    Template.deviceConnection.events({
        'click #cancelButton': disconnect
    });


    Template.service.helpers({
        //Blaze does not support each on objects
        charsArray: function() {
            return _.values(this.chars);
        }
    });

    Template.service.events({});

    Template.char.helpers({
        isLink: function (value) {
            //TODO is this enough?
            return value && value.match(/http:\/\//);
        },
        isReadable: function() {return this.properties.indexOf('Read') > -1;},
        isWritable: function() {return this.properties.indexOf('Write') > -1;}
    });

    Template.char.events({
        'click #Read': function(){
            var serviceId = this.service;
            var charId = this.id;
            ble.read(
                getSelectedDeviceId(),
                serviceId, charId,
                onReadChar.bind(this), onBleError);
            return false;
        },
        'click #OpenLink': function(evt){
            window.open(evt.target.value, '_blank', 'location=yes');
            return false;
        },

        'input #WriteInput': function(evt) {
            console.log(evt.target.value);
            this.newValue = evt.target.value;
        },

        'click #Write': function(){
            var deviceId = getSelectedDeviceId();
            var serviceId = this.service;
            var charId = this.id;
            var newValue = this.newValue;

            if (newValue) {
                //If this belongs to config service then enable notificatoins to
                //be able to get the response back!
                if (serviceId === ConfigServiceUUID) {
                    ble.startNotification(
                        getSelectedDeviceId(),
                        serviceId, charId,
                        onConfigStartNotify.bind(this), onBleError);
                }
                ble.write(deviceId, serviceId, charId, str2Bytes(newValue).buffer,
                    function() {console.log('Wrote config');},
                    onBleError);
            }
            return false;
        }
    });

    Meteor.startup(function () {
        //In case of code hot push, if there was a selected device before, just try to disconnect!
        disconnect();

        ble.scan([], 5, onDiscoverDevice, onBleError);
    });
}

function disconnect(){
    var selectedDeviceId = getSelectedDeviceId();
    if (selectedDeviceId) {
        ble.disconnect(selectedDeviceId, onDisconnect.bind(this),
            function(err) {console.log(err);});
        Session.set('selectedDeviceId', null);
    }
}

if (Meteor.isServer) {
    Meteor.startup(function () {
        // code to run on server at startup
    });
}

if (Meteor.isCordova) {
    console.log('Printed only in mobile cordova apps');
}

function getSelectedDeviceId() {
    return Session.get('selectedDeviceId');
}

function updateDevice(id, newValues) {
    return Devices.update(id, {$set: newValues});
}

function updateService(id, newValues) {
    return Services.update(id, {$set: newValues});
}

function onConnect(peripheral) {
    console.log('Device connected', this._id);

    updateDevice(this._id,
        {state: 'Connected', peripheral: peripheral});

        //Meteor does not support bulk inserts yet!
        parseServices(peripheral).forEach(
            function(peripheral) {
                Services.insert(peripheral);
            });
}
function onDisconnect() {
    console.log('Device disconnected', this._id);
}

function updateCharValue(char, data) {
    //TODO what if they are not string?
    var value = String.fromCharCode.apply(null, new Uint8Array(data));
    var field = {};
    field['chars.' + char.id +'.value'] = value;
    return updateService(char.service, field);
}

function onConfigStartNotify(data) {
    console.log(data);
    return updateCharValue(this, data);
}

function onReadChar(data) {
    return updateCharValue(this, data);
}

function onDiscoverDevice(device) {
    console.log(JSON.stringify(device));
    device._id = device.id;
    if (!device.name) {
        device.name = '-';
    }
    device.state = 'NotConnected';
    Devices.insert(device);
}

function onBleError(reason) {
    alert('ERROR: ' + reason); // real apps should use notification.alert
}

function parseServices(peripheral) {
    function parseChar(char) {
        char.id = char.characteristic;
        char.name = CHARACTERISTICS_UUIDs[char.id] || char.id;
        return char;
    }

    var parsedServices = {};
    var services = peripheral.services || [];
    var chars = peripheral.characteristics || [];

    services.forEach(function(serviceId) {
        var serviceName = SERVICE_UUIDS[serviceId] || serviceId;
        parsedServices[serviceId] = {_id: serviceId, name:serviceName, chars: {}};
    });

    chars.forEach(function(char) {
        var parsedChar = parseChar(char);
        parsedServices[char.service].chars[parsedChar.id] = parsedChar;
    });

    return _.values(parsedServices);
}
