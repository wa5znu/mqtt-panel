// -*-mode: js; js-switch-indent-offset: 4; indent-tags-mode: nil -*-

let host = 'mqtt.klotz.me';
let port = 8080;
let topic = 'sensor/#';
let useTLS = false;
let cleansession = true;
let reconnectTimeout = 3000;
let maxDataPoints = 86400;
let mqtt;


var bme680Chart = null;
var bme280Data = new Array();

var bme280Chart = null;
var bme280Data = new Array();

var dustChart = null;
var pm25Data = new Array();

let metric_colors = {
    'temp':        'rgb(255,99,132)',
    'hum':         'rgba(99,255,132, 0.25)',
    'hum_smooth':  'rgb(99,255,132)',
    'press':       'rgb(132,99,255)',
    'pm25':        'rgba(66,128,50, 0.25)',
    'pm25_smooth': 'rgb(66,128,50)'
}

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
    }

    mqtt.onConnectionLost = onConnectionLost;
    mqtt.onMessageArrived = onMessageArrived;
    console.log("Host: " + host + ", Port: " + port + ", Path: " + path + " TLS: " + useTLS);
    mqtt.connect(options);
}

function onConnect() {
    $('#status').html('Connected to ' + host + ':' + port + path)
        .attr('class', 'alert alert-success');
    mqtt.subscribe(topic, { qos: 0 });
    $('#topic').html(topic);
}

function onConnectionLost(response) {
    setTimeout(MQTTconnect, reconnectTimeout);
    $('#status').html("Connection lost. Reconnecting...")
        .attr('class', 'alert alert-warning');
}

function onMessageArrived(message) {
    try {
	handleMessage(message);
    } catch (exception) {
        console.log("onMessageArrived exception", exception, message);
	$('#status').html("onMessageArrived exception")
            .attr('class', 'alert alert-warning');
    }
}

function handleMessage(message) {
    let topic = message.destinationName;
    let payload = message.payloadString;
    let timestamp = makeTimestamp();

    console.log(timestamp + " topic=" + topic + " payload=" + payload);
    $('#message').html(timestamp + ' ' + topic + ': ' + payload);

    let topics = topic.split('/');
    let sensor_type = topics[1];

    switch (sensor_type) {
        case 'bme680':
            handle_bme680(timestamp, topic, payload);
            break;

        case 'bme280':
            handle_bme280(timestamp, topic, payload);
            break;

        case 'dust':
            handle_dust(timestamp, topic, payload);
            break;

        default:
            console.log('Error: Data do not match the MQTT topic.', timestamp, topic, payload);
            break;
    }
}

function makeTimestamp() {
    let d = Date();
    let monthday = d.toLocaleDateString('en-us', { month:"numeric", day:"numeric"});
    let t = d.toLocaleTimeString('en-gb').slice(0, 5);
    return monthday + " " + t;
    // return date.getMonth() + "-" + date.getDay() + date.toTimeString().slice(0,5);
    // return Date().slice(16, 21);
}

function handle_bme680(timestamp, topic, payload) {
    var temp = extract_float_field('temp', payload);
    var hum = extract_float_field('hum', payload);
    var press = (+(extract_float_field('press', payload) * 0.02953).toFixed(4));
    var gas = extract_float_field('gas', payload);

    $('#bme680TempSensor').html(payload);
    $('#bme680Label').text(temp + '°C ' + ((temp * 1.8) + 32).toFixed(1) + '°F ' + hum + '% ' + press + 'in ' + gas + ' Ω');
    $('#bme680Label').addClass('badge-default');

    let label = timestamp;
    let data = {
        "timestamp": timestamp,
        "temp": temp,
        "hum": hum,
        "press": press,
        "gas": gas
    }

    data = movingAvgHum([...bme680Data, data])[bme680Data.length];
    addToMetricsStream('temp680', bme680Data, label, data, bme680Chart);
}

function handle_bme280(timestamp, topic, payload) {
    var temp = extract_float_field('temp', payload);
    var hum = extract_float_field('hum', payload);
    var press = (+(extract_float_field('press', payload) * 0.02953).toFixed(4));

    $('#bme280Sensor').html(payload);
    $('#bme280Label').text(temp + '°C ' + ((temp * 1.8) + 32).toFixed(1) + '°F ' + hum + '% ' + press + 'in');
    $('#bme280Label').addClass('badge-default');

    let label = timestamp;
    let data = {
        "timestamp": timestamp,
        "temp": temp,
        "hum": hum,
        "press": press
    };

    data = movingAvgHum([...bme280Data, data])[bme280Data.length];
    addToMetricsStream('temp280', bme280Data, label, data, bme280Chart);
}

function handle_dust(timestamp, topic, payload) {
    var pm25 = extract_float_field('pm2_5', payload);

    $('#dustPm25Sensor').html(payload);
    $('#dustPm25Label').text(pm25 + ' μ');
    $('#dustPm25Label').addClass('badge-default');

    let label = timestamp;
    let data = {
        "timestamp": timestamp,
        "pm25": pm25
    };

    data = movingAvgPM25([...pm25Data, data])[pm25Data.length];
    addToMetricsStream('pm25', pm25Data, label, data, dustChart);
}

function extract_float_field(field_name, payload) {
    var r = RegExp(`(?:^|;)${field_name}=([0-9.]+)(?:;|$)`);
    var match = r.exec(payload);
    var m = match[1];
    var f = parseFloat(m);
    return f;
}


// https://www.chartjs.org/docs/latest/developers/updates.html
function addChartData(chart, label, data) {
    console.log("addChartData", chart, label, data);
    let chart_datasets = chart.data.datasets;
    chart.data.labels.push(label);
    chart_datasets.forEach((dataset) => {
        dataset.data.push(data);
    });
    chart.update();
}


// caller should call destroy on result before calling again
// on same canvas.  Or use addChartData instead.
function drawChart(chart_id, keys, data) {
    // console.log("drawChart", chart_id, keys, data);
    let ctx = document.getElementById(chart_id).getContext("2d");

    let chart_data = {
        "labels": data.map((d) => d.timestamp),
        backgroundColor: 'rgb(255, 99, 132)',
        datasets: keys.map((key) => ({
            label: key,
            data: data,
            borderColor: metric_colors[key],
            parsing: {
                xAxisKey: 'timestamp',
                yAxisKey: key,
            },
        })),
    }

    let plugin_options = {
        zoom: {
            zoom: {
                wheel: { enabled: true },
                mode: 'x',
            },
            pan: {
                enabled: true,
                mode: 'x',
            },
        }
    }

    // console.log(chart_data);
    let chart_options = {
        legend: {display: true},
        scales: { y: { type: 'logarithmic', bounds: 'ticks', ticks: { major: { enabled: true } } } },
        showLine: true,
        plugins: plugin_options,
    }

    let chart = new Chart(ctx, {type: 'line', data: chart_data, options:chart_options});
    return chart;
}


function addToMetricsStream(metrics_name, metrics_stream, new_label, new_data, chart) {
    metrics_stream.push(new_data);
    if (metrics_stream.length >= maxDataPoints) {
        metrics_stream.shift()
    }
    saveMetricsStream(metrics_name, metrics_stream);
    addChartData(chart, new_label, new_data);
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

function movingAvgHum(data, raw_field, smooth_field) {
    return movingAvg(data, 'hum', 30, 30, 'hum_smooth');
}

function movingAvgPM25(data) {
    return movingAvg(data, 'pm25', 30, 30, 'pm25_smooth');
}

// https://stackoverflow.com/a/63348486 https://stackoverflow.com/users/1583422/frank-orellana
// hacked to operate on a dict
// input  { ... `raw_fieldname`: value, ... }
// output { ... `raw_fieldname`: value, `smooth_fieldname`: smooth_value }
//
// stackoverflow docs:
// const myArr = [1, 1, 2, 2, 3, 4, 5, 6, 7, 8, 9];
// // averages of 7 (i.e. 7 day moving average):
// const avg7Before = movingAvg(myArr, 6); //6 before and the current
// const avg7Middle = movingAvg(myArr, 3, 3); //3 before, 3 after, plus the current
// const avg7After = movingAvg(myArr, 0, 6); //6 after plus the current
// console.log('original:',...myArr.map(x => x.toFixed(1)));
// console.log('7 before:',...avg7Before.map(x => x.toFixed(1)));
// console.log('7 middle:',...avg7Middle.map(x => x.toFixed(1)));
// console.log('7 after: ',...avg7After.map(x => x.toFixed(1)));

function movingAvg(array_of_dicts, raw_fieldname, countBefore, countAfter, smooth_fieldname) {
  if (countAfter == undefined) countAfter = 0;
  const result = [];
  for (let i = 0; i < array_of_dicts.length; i++) {
      const subArr = array_of_dicts.slice(Math.max(i - countBefore, 0), Math.min(i + countAfter + 1, array_of_dicts.length));
      const avg = (subArr.reduce((a, b) => a + (isNaN(b[raw_fieldname]) ? 0 : b[raw_fieldname]), 0) / subArr.length);
      let exemplar = {...array_of_dicts[i]}
      exemplar[smooth_fieldname] = (+(avg.toFixed(3)));
      result.push(exemplar);
  }
  return result;
}

$(document).ready(function () {
    bme680Data = restoreMetricsStream('temp680');
    bme280Data = restoreMetricsStream('temp280');
    pm25Data = restoreMetricsStream('pm25');

    bme280Chart = drawChart('bme280Chart', ['temp', 'hum', 'hum_smooth', 'press'], movingAvgHum(bme280Data));
    bme680Chart = drawChart('bme680Chart', ['temp', 'hum', 'hum_smooth', 'press'], movingAvgHum(bme680Data));
    dustChart = drawChart('dustChart', ['pm25', 'pm25_smooth'], movingAvgPM25(pm25Data));

    MQTTconnect();
});
