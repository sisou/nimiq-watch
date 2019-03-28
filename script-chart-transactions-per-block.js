template.transactionsPerBlockChart = tmpl('template-transactions-per-block-chart');

async function _transactionsPerBlock(range, skipRender) {
    range      = range || 'month';
    skipRender = skipRender || false;

    if(!skipRender) {
        // Only replace infobox contents when not coming from the range toggle
        $infobox.innerHTML = template.transactionsPerBlockChart();
        window.scrollTo(0, $infobox.offsetTop - 100);
    }

    fetch(apiUrl + '/statistics/transactions/' + range).then(function(response) {
        response.json().then(function(data) { // { h: block_height, t: timestamp, v: value, c: count }
            var transactionCount = data.map(function(block) { return block['c']; });
            var transactionValue = data.map(function(block) { return block['v']; });
            var timestamp = data.map(function(block) { return block['t']; });

            // Fill empty times
            var i = 0
            var gap;
            var now = Date.now() / 1000;

            switch(range) {
                case 'day':
                    gap = 15 * 60; // 15 minutes
                    break;
                case 'week':
                    gap = 2 * 60 * 60 // 2 hours
                    break;
                case 'month':
                    gap = 8 * 60 * 60; // 8 hours
                    break;
                default: // 'year'
                    gap = 4 * 24 * 60 * 60; // 4 days
                    break;
            }

            while(timestamp[i]) {
                if(
                    (!timestamp[i + 1] && now - timestamp[i] > gap * 1.8)
                 || (timestamp[i + 1] > timestamp[i] + gap * 1.8)
                ) {
                    // Add missing time
                    timestamp.splice(i + 1, 0, timestamp[i] + gap);
                    transactionCount.splice(i + 1, 0, 0);
                    transactionValue.splice(i + 1, 0, 0);
                }
                i++;
            }

            var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

            var timelabel = timestamp.map(function(time) {
                var date = new Date(time * 1000);
                return date.getDate() + ". " + months[date.getMonth()] + " " + date.toTimeString().slice(0, 5);
            });

            transactionValue = transactionValue.map(value => Nimiq.Policy.satoshisToCoins(value));

            var _renderTransactionsPerBlockChart = function() {
                try {
                    $infobox.removeChild($infobox.getElementsByClassName('blocklist-loader')[0]);
                }
                catch(e) {}

                $infobox.getElementsByClassName('chart-valid-info')[0].innerHTML = "Created " + (new Date()).toLocaleString();

                if(window.chart) window.chart.destroy();

                var ctx = $infobox.getElementsByTagName('canvas')[0].getContext('2d');

                window.chart = new Chart(ctx, {
                    // The type of chart we want to create
                    type: 'bar',

                    // The data for our dataset
                    data: {
                        labels: timelabel,
                        datasets: [
                        {
                            label: "Transaction Volume",
                            backgroundColor: '#F6AE2D',
                            pointBackgroundColor: 'transparent',
                            borderColor: '#F6AE2D',
                            pointRadius: 3,
                            borderWidth: 2,
                            fill: false,
                            data: transactionValue,
                            type: 'line',
                            yAxisID: 'transactionValue'
                        },
                        {
                            label: "Transactions",
                            backgroundColor: '#042146',
                            borderColor: '#042146',
                            data: transactionCount,
                            yAxisID: 'transactionCount'
                        }]
                    },

                    // Configuration options go here
                    options: {
                        legend: {
                            // display: false
                            reverse: true,
                            labels: {
                                fontFamily: "'Nunito', 'Source Sans Pro', sans-serif",
                                fontSize: 16,
                                boxWidth: 16
                            }
                        },
                        scales: {
                            yAxes: [
                                {
                                    id: 'transactionValue',
                                    position: 'right',
                                    scaleLabel: {
                                        display: true,
                                        labelString: "Transaction Volume",
                                        fontFamily: "'Nunito', 'Source Sans Pro', sans-serif",
                                        fontSize: 16
                                    }
                                },
                                {
                                    id: 'transactionCount',
                                    position: 'left',
                                    scaleLabel: {
                                        display: true,
                                        labelString: "Transactions",
                                        fontFamily: "'Nunito', 'Source Sans Pro', sans-serif",
                                        fontSize: 16
                                    }
                                }
                            ]
                        },
                        animation: {
                            duration: 0,
                        },
                    }
                });
            };

            if(document.getElementById('chart-js-script')) {
                _renderTransactionsPerBlockChart();
            }
            else {
                var scriptTag = document.createElement('script');
                scriptTag.id = "chart-js-script";
                scriptTag.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/2.6.0/Chart.min.js";
                scriptTag.onload = _renderTransactionsPerBlockChart;
                document.body.appendChild(scriptTag);
            }
        });
    });
}

function switchTransactionsPerBlockRange(range) {
    _transactionsPerBlock(range, true);
}
