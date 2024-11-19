template.stakeDistributionChart = tmpl('template-stake-distribution-chart');

async function _stakeDistribution() {
    $infobox.innerHTML = template.stakeDistributionChart();
    window.scrollTo(0, $infobox.offsetTop - 100);

    // Collect data
    fetch(publicUrl + '/api/v2/active-validators').then(function(response) {
        response.json().then(function(data) { // { address: string, balance: number }[]

            // Sort descending by balance
            data.sort((a, b) => b.balance - a.balance);

            // Converting into label and data arrays
            var addresses        = data.map(function(obj) { return obj.address; });
            var labels           = data.map(function(obj) { return _labelAddress(obj.address, true); });
            var stakes           = data.map(function(obj) { return obj.balance; });
            var totalStake       = stakes.reduce(function(sum, stake) { return sum + stake; }, 0);

            // Filter out the little guys
            var minShare = 0.01;

            var otherStake = 0;
            var otherValidators = 0;
            stakes = stakes.filter(function(stake) {
                if(stake / totalStake < minShare) {
                    otherStake += stake;
                    otherValidators++;
                    return false;
                }
                return true;
            });

            // Adapt labels
            if(otherValidators > 0) {
                labels = labels.slice(0, stakes.length);
                labels.push(otherValidators + ' others');

                stakes.push(otherStake);
            }

            // Convert into percentages
            const stakePercentages = stakes.map(function(stake) { return Math.round(stake / totalStake * 10000) / 100; });

            var _renderStakeDistributionChart = function() {
                try {
                    $infobox.querySelector('.stake-distribution-chart-wrapper').removeChild($infobox.getElementsByClassName('blocklist-loader')[0]);
                }
                catch(e) {}

                $infobox.getElementsByClassName('chart-valid-info')[0].innerHTML = "Created " + (new Date()).toLocaleString();

                if(window.chart) window.chart.destroy();

                var ctxs = $infobox.getElementsByTagName('canvas')

                var ctx  = ctxs[0].getContext('2d');

                window.chart = new Chart(ctx, {
                    // The type of chart we want to create
                    type: 'doughnut',

                    // The data for our dataset
                    data: {
                        labels: labels,
                        datasets: [
                        {
                            label: "Stake",
                            data: stakes,
                            backgroundColor: (function() {
                                if(otherValidators > 0) {
                                    var colors = default_colors.slice();
                                    colors[stakes.length - 1] = Chart.defaults.global.defaultColor;
                                    return colors;
                                }
                                else return default_colors;
                            })()
                        }]
                    },

                    // Configuration options go here
                    options: {
                        legend: {
                            display: false
                        },
                        tooltips: {
                            callbacks: {
                                label: function(item, chart) {
                                    return chart.labels[item.index] + ': ' + stakes[item.index] + ' (' + stakePercentages[item.index].toFixed(2) + '%)';
                                }
                            }
                        },
                        animation: {
                            duration: 0,
                        },
                    }
                });
            };

            if(document.getElementById('chart-js-script')) {
                _renderStakeDistributionChart();
            }
            else {
                var scriptTag = document.createElement('script');
                scriptTag.id = "chart-js-script";
                scriptTag.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/2.6.0/Chart.min.js";
                scriptTag.onload = _renderStakeDistributionChart;
                document.body.appendChild(scriptTag);
            }

            const table = $infobox.querySelector('.validators-table');
            let html = '<tr><th>Validator</th><th>Stake [NIM]</th><th>%</th></tr>';

            for (let i = 0; i < labels.length; i++) {
                let label = labels[i];
                if (!labels[i].includes('others')) {
                    label = `<hash><a href="#${addresses[i].replace(/ /g, '+')}" onclick="_linkClicked(this)">${label}</a></hash>`;
                }
                html += `<tr><td>${label}</td><td>${_formatBalance(Nimiq.Policy.satoshisToCoins(stakes[i]), true)}</td><td>${stakePercentages[i].toFixed(2)}</td>`;
            }

            table.innerHTML = html;
        });
    });
}
