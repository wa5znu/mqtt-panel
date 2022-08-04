let host = 'mqtt.klotz.me';
let port = 8080;
let topic = 'sensor/#';
let useTLS = false;
let cleansession = true;
let reconnectTimeout = 3000;
let maxDataPoints = 500;
let mqtt;
    

let temp680Data = new Array();
let temp280Data = new Array();
let pm25Data = new Array();


function MQTTconnect() {
    if (typeof path == "undefined") {
        path = '/';
    }
    mqtt = new Paho.MQTT.Client(host, port, path, "mqtt_panel" + parseInt(Math.random() * 100, 10));
    let options = {
        timeout: 3,
        useSSL: useTLS,
        cleanSession: cleansession,
        onSuccess: onConnect,
        onFailure: function (message) {
            $('#status').html("Connection failed: " + message.errorMessage + "Retrying...")
                .attr('class', 'alert alert-danger');
            setTimeout(MQTTconnect, reconnectTimeout);
        }
    };

    mqtt.onConnectionLost = onConnectionLost;
    mqtt.onMessageArrived = onMessageArrived;
    console.log("Host: " + host + ", Port: " + port + ", Path: " + path + " TLS: " + useTLS);
    mqtt.connect(options);
};

function onConnect() {
    $('#status').html('Connected to ' + host + ':' + port + path)
        .attr('class', 'alert alert-success');
    mqtt.subscribe(topic, { qos: 0 });
    $('#topic').html(topic);
};

function onConnectionLost(response) {
    setTimeout(MQTTconnect, reconnectTimeout);
    $('#status').html("Connection lost. Reconnecting...")
        .attr('class', 'alert alert-warning');
};

function onMessageArrived(message) {
    let topic = message.destinationName;
    let payload = message.payloadString;
    let timestamp = Date().slice(16, 21);
    console.log(timestamp + " topic=" + topic + " payload=" + payload);
    $('#message').html(timestamp + ' ' + topic + ': ' + payload);
    let topics = topic.split('/');
    let sensor_type = topics[1];

    function extract_float_field(field_name, payload) {
        var r = RegExp(`(?:^|;)${field_name}=([0-9.]+)(?:;|$)`);
        var match = r.exec(payload);
        var m = match[1];
        var f = parseFloat(m);
        return f;
    }

    // sensor/bme680/QTPY_1091a83186e0 temp=28.46;hum=50.51;press=1015.772;gas=47096
    // console.log('topic', topic, 'payload', payload, 'sensor type', sensor_type);
    switch (sensor_type) {
        case 'bme680':
            var temp = extract_float_field('temp', payload);
            var hum = extract_float_field('hum', payload);
            var press = extract_float_field('press', payload) * 0.02953;
            var gas = extract_float_field('gas', payload);

            $('#bme680TempSensor').html(payload);
            $('#bme680TempLabel').text(temp + ' °C');
            $('#bme680TempLabel').addClass('badge-default');

            temp680Data.push({
                "timestamp": Date().slice(16, 21),
                "temp": temp,
                "hum": hum,
                "press": press,
                "gas": gas
            });
            if (temp680Data.length >= maxDataPoints) {
                temp680Data.shift()
            }
            saveMetricsStream('temp680', temp680Data);
            drawChart('bme680Chart', ['temp', 'hum', 'press'], temp680Data);
            break;

        case 'bme280':
            var temp = extract_float_field('temp', payload);
            var hum = extract_float_field('hum', payload);
            var press = extract_float_field('press', payload) * 0.02953;

            $('#bme280TempSensor').html(payload);
            $('#bme280TempLabel').text(temp + ' °C');
            $('#bme280TempLabel').addClass('badge-default');

            temp280Data.push({
                "timestamp": Date().slice(16, 21),
                "temp": temp,
                "hum": hum,
                "press": press
            });
            if (temp280Data.length >= maxDataPoints) {
                temp280Data.shift()
            }
            saveMetricsStream('temp280', temp280Data);
            drawChart('bme280Chart', ['temp', 'hum', 'press'], temp280Data);
            break;

        case 'dust':
            var pm25 = extract_float_field('pm2_5', payload);

            $('#dustPm25Sensor').html(payload);
            $('#dustPm25Label').text(pm25 + ' μ');
            $('#dustPm25Label').addClass('badge-default');

            pm25Data.push({
                "timestamp": Date().slice(16, 21),
                "pm25": pm25
            });
            if (pm25Data.length >= maxDataPoints) {
                pm25Data.shift()
            }
            saveMetricsStream('pm25', pm25Data);
            drawChart('dustChart', ['pm25'], pm25Data);
            break;

        default:
            console.log('Error: Data do not match the MQTT topic.', payload);
            break;
    }
};

function drawChart(chart_id, keys, data) {
    // console.log("drawChart", chart_id, keys, data);
    let ctx = document.getElementById(chart_id).getContext("2d");

    let values = {}
    let timestamps = []

    data.forEach((entry) => {
        timestamps.push(entry.timestamp);
        keys.forEach((key) => {
	    let val = entry[key];
	    if (key in values) {
		values[key].push(val);
	    } else {
		values[key] = [val];
            }
        })
    });
    
    let colors = {
        'temp': 'rgb(255, 99, 132)',
        'hum': 'rgb(99,255,132)',
        'press': 'rgb(132,99,255)',
        'pm25': 'rgb(132,255,99)'
    }
        
    let chart_data = {
        "labels": timestamps,
        // backgroundColor: 'rgb(255, 99, 132)'
        "datasets": keys.map((key) => ({ 'borderColor': colors[key], 'data': values[key] })),
    };
    // console.log(chart_data);
    chart_options = {
        legend: {display: false}
    };
    let chart = new Chart(ctx, {type: 'line', data: chart_data, options:chart_options});
}


function saveMetricsStream(metric_name, metric_values) {
    let key = 'metrics-' + metric_name;
    let value = JSON.stringify(metric_values);
    localStorage.setItem(key, value);
}

function restoreMetricsStream(metric_name) {
    let key = 'metrics-' + metric_name;
    let value = localStorage.getItem(key)
    let metrics_values;

    try {
        metrics_values = JSON.parse(value);
    } catch (exception) {
        console.log("restoreMetricsStream exception", exception, key, value);
    }

    return metrics_values || new Array();
}


$(document).ready(function () {
    temp680Data = restoreMetricsStream('temp680');
    temp280Data = restoreMetricsStream('temp280');
    pm25Data = restoreMetricsStream('pm25');

    drawChart("bme680Chart", ['temp', 'hum', 'press'], temp680Data);
    drawChart("bme280Chart", ['temp', 'hum', 'press'], temp280Data);
    drawChart("dustChart", ['pm25'], pm25Data);
    MQTTconnect();
});
