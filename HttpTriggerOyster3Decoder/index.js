module.exports = async function (context, req) {
    context.log('JavaScript HTTP trigger function processed a request.');

    const timestamp = req.body.timestamp;
    const payload = req.body.payload;
    const port = req.body.port;

    const responseMessage = decode(port, payload, timestamp);

    context.res = {
        // status: 200, /* Defaults to 200 */
        body: responseMessage
    };
}

let timestampTs;

const decode = (argPort, argPayload, argTimestamp) => {
   
    timestampTs = argTimestamp;

    var port = parseInt(argPort);


    if (isNaN(port) || (port < 1) || (port > 255)) {
        return ["error", "port is not valid"]
    }


    var val = argPayload;
    var bytes = [];
    if (isHex(val, port))
    bytes = getHex(val);
    else
    bytes = getBase64(val);
    var object = Decoder(bytes, port);
    if (object == null) return ["error", "payload is not valid"]
    else {
        return object;
    }
    
}
    function isHex(val, port) {
    if (val.length == 0)
    return true;
    var stripped = val;
    if (val.startsWith('0x') || val.startsWith('0X'))
    stripped = val.substring(2);
    // Check it's in pairs, with or without whitespace
    if (!/^([\-\s]*[A-Fa-f0-9]{2}[\-\s]*)*$/.test(stripped))
    return false;
    if (getBase64(val) == null)
    return true;
    // Could be hex, or could be Base64.
    // Prioritize hex since it produces shorter messages.
    return (Decoder(getHex(stripped), port) != null);
    }
    function getHex(val) {
    if (val.startsWith('0x') || val.startsWith('0X'))
    val = val.substring(2); // get rid of starting '0x'
    // remove whitespace
    val = val.replace(/[ \-\s]/g, "");
    if ((val.length & 1) !== 0)
    return null;
    var numBytes = val.length / 2;
    var bytes = [];
    for (var i = 0; i < numBytes; i++) {
    bytes.push(parseInt(val.substring(i * 2, (i * 2) + 2), 16));
    }
    return bytes;
    }
    var keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="
    function getBase64(input) {
    var output = new Array();
    var chr1,
    chr2,
    chr3;
    var enc1,
    enc2,
    enc3,
    enc4;
    var i = 0;
    var orig_input = input;
    input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");
    if (orig_input != input)
    return null;
    if (input.length % 4)
    return null;
    var j = 0;
    while (i < input.length) {
    enc1 = keyStr.indexOf(input.charAt(i++));
    enc2 = keyStr.indexOf(input.charAt(i++));
    enc3 = keyStr.indexOf(input.charAt(i++));
    enc4 = keyStr.indexOf(input.charAt(i++));
    chr1 = (enc1 << 2) | (enc2 >> 4);
    chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    chr3 = ((enc3 & 3) << 6) | enc4;
    output[j++] = chr1;
    if (enc3 != 64)
    output[j++] = chr2;
    if (enc4 != 64)
    output[j++] = chr3;
    }
    return output;
    }
    function Decoder(bytes, port) {
    try {
    return decodeUplink({
    fPort: port,
    bytes: bytes
    }).data;
    }
    catch (e) {
    return null;
    }
    }
    function MakeBitParser(bytes, offset, length) {
    return {
    bits: bytes.slice(offset, offset + length),
    offset: 0,
    bitLength: length * 8,
    U32LE: function U32LE(bits) {
    if (bits > 32)
    throw ("Invalid argument!");
    if (this.offset + bits > this.bitLength)
    throw ("Read past end of data!");
    var out = 0;
    var total = 0;
    while (bits > 0) {
    var byteNum = Math.floor(this.offset / 8);
    var discardLSbs = this.offset & 7;
    var avail = Math.min(8 - discardLSbs, bits);
    var extracted = (this.bits[byteNum] >>> discardLSbs);
    var masked = (extracted << (32 - avail)) >>> (32 - avail);
    out |= ((masked << total) >>> 0);
    total += avail;
    bits -= avail;
    this.offset += avail;
    }
    return out;
    },
    S32LE: function S32LE(bits) {
    return (this.U32LE(bits) << (32 - bits)) >> (32 - bits);
    }
    };
    }
    function ResolveTime(timestamp15, approxReceptionTime) {
    if (timestamp15 === 127)
    return null;
    var approxUnixTime = Math.round(approxReceptionTime.getTime() / 1000);
    // Device supplies: round(unix time / 15) modulo 127.
    // We're assuming that the uplink was sent some time BEFORE refTime,
    // and got delayed by network lag. We'll resolve the timestamp
    // in the window [approxReceptionTime - 21m, approxReceptionTime + 10m],
    // to allow for 10m of error in approxReceptionTime, and 10m of network lag.
    // So refTime = approxReceptionTime + 10m.
    var refTime = approxUnixTime + 600;
    var timestamp = timestamp15 * 15;
    // refTime
    // v
    // [ | | | ]
    // ^ ^ ^ ^
    // timestamp timestamp timestamp timestamp
    // refTime
    // v
    // [ | | | ]
    // ^ ^ ^ ^
    // timestamp timestamp timestamp timestamp
    // We want the timestamp option immediately to the left of refTime.
    var refTimeMultiple = Math.floor(refTime / (127 * 15));
    
    var refTimeModulo = refTime % (127 * 15);
    var closestUnixTime = 0;
    if (refTimeModulo > timestamp)
    closestUnixTime = refTimeMultiple * (127 * 15) + timestamp;
    else
    closestUnixTime = (refTimeMultiple - 1) * (127 * 15) + timestamp;
    
    return new Date(closestUnixTime * 1000).toISOString();
    }
    function decodeUplink(input) {
    var p = input.fPort;
    var b = MakeBitParser(input.bytes, 0, input.bytes.length);
    var d = {};
    var w = [];
    if (p === 1) {
    d.type = "position";
    var l = {};
    l.latitudeDeg = Number((b.S32LE(32) / 1e7).toFixed(7)); // decimal scaling
    l.longitudeDeg = Number((b.S32LE(32) / 1e7).toFixed(7));
    d.inTrip = (b.U32LE(1) !== 0);
    d.fixFailed = (b.U32LE(1) !== 0);
    l.headingDeg = Number((b.U32LE(6) * 5.625).toFixed(2));
    l.speedKmph = b.U32LE(8);
    d.batV = Number((b.U32LE(8) * 0.025).toFixed(3));
    d.inactivityAlarm = null;
    d.batCritical = null;
    if (d.fixFailed) {
    d.cached = l;
    //w.push("fix failed");
    } else {
    d = Object.assign(d, l);
    }
    } else if (p === 2) {
    d.type = "downlink ack";
    d.sequence = b.U32LE(7);
    d.accepted = (b.U32LE(1) !== 0);
    d.fwMaj = b.U32LE(8);
    d.fwMin = b.U32LE(8);
    if (input.bytes.length < 6) {
    d.prodId = null;
    d.hwRev = null;
    d.port = null;
    } else {
    d.prodId = b.U32LE(8);
    d.hwRev = b.U32LE(8);
    d.port = b.U32LE(8);
    }
    } else if (p === 3) {
    d.type = "stats";
    d.initialBatV = Number((4.0 + 0.1 * b.U32LE(4)).toFixed(2));
    d.txCount = 32 * b.U32LE(11);
    d.tripCount = 32 * b.U32LE(13);
    d.gnssSuccesses = 32 * b.U32LE(10);
    d.gnssFails = 32 * b.U32LE(8);
    d.aveGnssFixS = b.U32LE(9);
    d.aveGnssFailS = b.U32LE(9);
    d.aveGnssFreshenS = b.U32LE(8);
    d.wakeupsPerTrip = b.U32LE(7);
    d.uptimeWeeks = b.U32LE(9);
    } else if (p === 4) {
    d.type = "position";
    var l = {};
    l.latitudeDeg = Number((256 * b.S32LE(24) / 1e7).toFixed(7)); // decimal scaling, truncated integer
    l.longitudeDeg = Number((256 * b.S32LE(24) / 1e7).toFixed(7));
    l.headingDeg = 45 * b.U32LE(3);
    l.speedKmph = 5 * b.U32LE(5);
    d.batV = b.U32LE(8);
    d.inTrip = (b.U32LE(1) !== 0);
    d.fixFailed = (b.U32LE(1) !== 0);
    d.inactivityAlarm = (b.U32LE(1) !== 0);
    if (b.U32LE(1) === 0)
    d.batV = Number((0.025 * d.batV).toFixed(3));
    else
    d.batV = Number((3.5 + 0.032 * d.batV).toFixed(3));
    crit = b.U32LE(2);
    if (crit === 0)
    d.batCritical = null;
    else if (crit === 1)
    d.batCritical = false;
    else
    d.batCritical = true;
    if (d.fixFailed) {
    d.cached = l;
    //w.push("fix failed");
    } else {
    d = Object.assign(d, l);
    }
    } else if (p === 30) {
    d.type = "hello";
    d.fwMaj = b.U32LE(8);
    d.fwMin = b.U32LE(8);
    d.prodId = b.U32LE(8);
    d.hwRev = b.U32LE(8);
    d.resetPowerOn = (b.U32LE(1) !== 0);
    d.resetWatchdog = (b.U32LE(1) !== 0);
    d.resetExternal = (b.U32LE(1) !== 0);
    d.resetSoftware = (b.U32LE(1) !== 0);
    b.U32LE(4);
    d.watchdogReason = b.U32LE(16);
    d.initialBatV = Number((3.5 + 0.032 * b.U32LE(8)).toFixed(2));
    } else if (p === 31) {
    d.type = "stats v3";
    d.ttff = b.U32LE(8);
    d.wakeupsPerTrip = b.U32LE(8);
    d.initialBatV = Number((3.5 + 0.032 * b.U32LE(8)).toFixed(3));
    d.currentBatV = Number((3.5 + 0.032 * b.U32LE(8)).toFixed(3));
    d.batCritical = (b.U32LE(1) !== 0);
    d.batLow = (b.U32LE(1) !== 0);
    d.tripCount = 32 * b.U32LE(14);
    d.uptimeWeeks = b.U32LE(10);
    d.mWhUsed = 10 * b.U32LE(10);
    d.percentLora = 100 / 32 * b.U32LE(5);
    d.percentGnssSucc = 100 / 32 * b.U32LE(5);
    d.percentGnssFail = 100 / 32 * b.U32LE(5);
    d.percentSleepDis = 100 / 32 * b.U32LE(5);
    d.percentOther = 100 - d.percentLora - d.percentGnssSucc - d.percentGnssFail - d.percentSleepDis;
    } else if (p === 33) {
    d.type = "position";
    
    var l = {};

    d.fixFailed = (b.U32LE(1) !== 0);
    l.latitudeDeg = Number((180 * b.S32LE(23) / (1 << 23)).toFixed(7)); // binary scaling
    l.longitudeDeg = Number((360 * b.S32LE(24) / (1 << 24)).toFixed(7));
    d.inTrip = (b.U32LE(1) !== 0);

    d.timestamp = b.U32LE(7);
  
    d.time = ResolveTime(d.timestamp, new Date(Date.parse(timestampTs)));
    
    d.batCritical = (b.U32LE(1) !== 0);
    d.inactivityAlarm = (b.U32LE(1) !== 0);
    mins = 2 * b.U32LE(14); // lower bound
    d.inactiveDuration = Math.floor(mins / 1440) + 'd' + Math.floor((mins % 1440) / 60) + 'h' + (mins % 60) + 'm';
    d.batV = Number((3.5 + 0.032 * b.U32LE(8)).toFixed(3));
    l.headingDeg = 45 * b.U32LE(3);
    l.speedKmph = 5 * b.U32LE(5);
    

    // if (d.fixFailed) {
    //     /// IKKJE SETT TIL CACHE MED LEGG DET TIL PÅ L og lag en ny property med cached=true
    // d.cached = l;
    // //w.push("fix failed");
    // } else {
    // d = Object.assign(d, l);
    // }

    /// Tellsens custom
    if (d.fixFailed) {
        d.cached = true 
    } else {
        d.cached = false;
    }
    
    d = Object.assign(d, l);
    /// Tellsens custom End

    } else {
    return {
    warnings: ['unknown FPort'],
    };
    }
    return {
    data: d,
    warnings: w,
    };
    }

   //export default decode;

    // const port = 33
    // const payload =  'E5xXtJIDuBAAOQE=' // << cached // not cached'SptXH5ED8gAANQM='
    // const res = decode(port, payload, '04 Mar 2022 14:03:00 GMT');
    // console.log(res)
