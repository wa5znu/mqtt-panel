let host = 'mqtt.klotz.me';
let port = 8080;
let topic = 'sensor/#';
let useTLS = false;
let cleansession = true;
let reconnectTimeout = 3000;
let temp680Data = new Array();
let temp280Data = new Array();
let pm25Data = new Array();
let mqtt;

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
    console.log("Topic: " + topic + ", Message payload: " + payload);
    $('#message').html(topic + ', ' + payload);
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
    console.log('topic', topic, 'payload', payload, 'sensor type', sensor_type);
    switch (sensor_type) {
        case 'bme680':
	    var temp = extract_float_field('temp', payload);

            $('#bme680TempSensor').html('(Sensor value: ' + temp + ')');
            $('#bme680TempLabel').text(temp + ' °C');
            $('#bme680TempLabel').addClass('badge-default');

            temp680Data.push({
                "timestamp": Date().slice(16, 21),
                "value": temp
            });
            if (temp680Data.length >= 10) {
                temp680Data.shift()
            }
            drawChart('bme680Chart', temp680Data);
	    break;

        case 'bme280':
	    var temp = extract_float_field('temp', payload);

            $('#bme280TempSensor').html('(Sensor value: ' + temp + ')');
            $('#bme280TempLabel').text(temp + ' °C');
            $('#bme280TempLabel').addClass('badge-default');

            temp280Data.push({
                "timestamp": Date().slice(16, 21),
                "value": temp
            });
            if (temp280Data.length >= 10) {
                temp280Data.shift()
            }
            drawChart('bme280Chart', temp280Data);
	    break;

        case 'dust':
	    var pm25 = extract_float_field('pm2_5', payload);

            $('#dustPm25Sensor').html('(Sensor value: ' + pm25 + ')');
            $('#dustPm25Label').text(pm25 + ' μ');
            $('#dustPm25Label').addClass('badge-default');

            pm25Data.push({
                "timestamp": Date().slice(16, 21),
                "value": pm25
            });
            if (pm25Data.length >= 10) {
                pm25Data.shift()
            }
            drawChart('dustChart', pm25Data);
            break;

        case 'living':
            $('#livingTempSensor').html('(Sensor value: ' + payload + ')');
            $('#livingTempLabel').text(payload + ' °C');
            $('#livingTempLabel').addClass('badge-default');

            tempData.push({
                "timestamp": Date().slice(16, 21),
                "value": parseInt(payload)
            });
            if (tempData.length >= 10) {
                tempData.shift()
            }
            drawChart('living', tempData);
            break;

        case 'basement':
            $('#basementTempSensor').html('(Sensor value: ' + payload + ')');
            if (payload >= 25) {
                $('#basementTempLabel').text(payload + ' °C - too hot');
                $('#basementTempLabel').removeClass('badge-warning badge-success badge-info badge-primary').addClass('badge-danger');
            } else if (payload >= 21) {
                $('#basementTempLabel').text(payload + ' °C - hot');
                $('#basementTempLabel').removeClass('badge-danger badge-success badge-info badge-primary').addClass('badge-warning');
            } else if (payload >= 18) {
                $('#basementTempLabel').text(payload + ' °C - normal');
                $('#basementTempLabel').removeClass('badge-danger badge-warning badge-info badge-primary').addClass('badge-success');
            } else if (payload >= 15) {
                $('#basementTempLabel').text(payload + ' °C - low');
                $('#basementTempLabel').removeClass('badge-danger badge-warning badge-success badge-primary').addClass('badge-info');
            } else if (mpayload <= 12) {
                $('#basementTempLabel').text(payload + ' °C - too low');
                $('#basementTempLabel').removeClass('badge-danger badge-warning badge-success badge-info').addClass('badge-primary');
                basementTemp.push(parseInt(payload));
                if (basementTemp.length >= 20) {
                    basementTemp.shift()
                }
            }
            break;
        default:
            console.log('Error: Data do not match the MQTT topic.', payload);
            break;
    }
};

function drawChart(chart_id, data) {
    let ctx = document.getElementById(chart_id).getContext("2d");


    let values = []
    let timestamps = []

    data.map((entry) => {
        values.push(entry.value);
        timestamps.push(entry.timestamp);
    });

    let chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: timestamps,
            datasets: [{
                // backgroundColor: 'rgb(255, 99, 132)',
                borderColor: 'rgb(255, 99, 132)',
                data: values
            }]
        },
        options: {
            legend: {
                display: false
            }
        }
    });
}

$(document).ready(function () {
    drawChart("bme680Chart", temp680Data);
    drawChart("bme280Chart", temp280Data);
    drawChart("dustChart", pm25Data);
    MQTTconnect();
});
