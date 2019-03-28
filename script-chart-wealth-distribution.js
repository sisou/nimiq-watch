template.wealthDistributionChart = tmpl('template-wealth-distribution-chart');

async function _wealthDistribution(axisType = "linear", skipRender = false) {
    if(!skipRender) {
        // Only replace infobox contents when not coming from the scale toggle
        $infobox.innerHTML = template.wealthDistributionChart();
        window.scrollTo(0, $infobox.offsetTop - 100);
    }

    var rootKey  = await $.accounts._tree._store.getRootKey();
    var rootNode = await $.accounts._tree._store.get(rootKey);

    var balances = [];

    await _resolveAccountsTreeNode(rootNode, "", balances);

    balances = balances.filter(balance => balance);
    balances.sort((a, b) => a > b ? -1 : a < b ? 1 : 0);

    balances = balances.map(balance => Nimiq.Policy.satoshisToCoins(balance));

    var _renderWealthDisributionChart = function() {
        var labels = [];
        for (var i = 1; i <= balances.length; i++) { labels.push(i); }
        labels = labels.map(label => label + '.');

        try {
            $infobox.removeChild($infobox.getElementsByClassName('blocklist-loader')[0]);
        }
        catch(e) {}

        var time = new Date($.blockchain.head.timestamp * 1000);
        $infobox.getElementsByClassName('chart-valid-info')[0].innerHTML = "Created at block #" + $.blockchain.head.height + " - " + time.toLocaleString()

        if(window.chart) window.chart.destroy();

        var ctx = $infobox.getElementsByTagName('canvas')[0].getContext('2d');

        window.chart = new Chart(ctx, {
            // The type of chart we want to create
            type: 'line',

            // The data for our dataset
            data: {
                labels: labels,
                datasets: [{
                    label: "BetaNIM",
                    pointBackgroundColor: '#042146',
                    borderColor: '#042146',
                    data: balances
                }]
            },

            // Configuration options go here
            options: {
                animation: {
                    duration: 0
                },
                legend: {
                    display: false
                },
                scales: {
                    yAxes: [{
                        ticks: {
                            callback: (value) => {
                                if(axisType === "linear") {
                                    return value;
                                }
                                else if(axisType === "logarithmic") {
                                    let label = Math.round(parseFloat(value) * Nimiq.Policy.SATOSHIS_PER_COIN) / Nimiq.Policy.SATOSHIS_PER_COIN;

                                    if(label.toString()[0] !== "1" && label.toString().slice(-1) !== "1") return null;

                                    return label;
                                }
                            }
                        },
                        type: axisType,
                        scaleLabel: {
                            display: true,
                            labelString: "Balance in NIM",
                            fontFamily: "'Nunito', 'Source Sans Pro', sans-serif",
                            fontSize: 16
                        }
                    }],
                    xAxes: [{
                        scaleLabel: {
                            display: true,
                            labelString: "Accounts (ordered by balance)",
                            fontFamily: "'Nunito', 'Source Sans Pro', sans-serif",
                            fontSize: 16
                        }
                    }]
                }
            }
        });

        $infobox.getElementsByTagName('input')[0].removeAttribute('disabled');
    };

    if(document.getElementById('chart-js-script')) {
        _renderWealthDisributionChart();
    }
    else {
        var scriptTag = document.createElement('script');
        scriptTag.id = "chart-js-script";
        scriptTag.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/2.6.0/Chart.min.js";
        scriptTag.onload = _renderWealthDisributionChart;
        document.body.appendChild(scriptTag);
    }
}

async function _resolveAccountsTreeNode(currentNode, currentPrefix, balances) {
    if(!currentNode) return;

    currentPrefix += currentNode.prefix;
    if (currentNode.isTerminal()) {
        balances.push(currentNode.account.balance.value);
    }
    else {
        for (const childKey of currentNode.getChildren()) {
            const node = await $.accounts._tree._store.get(childKey);
            await _resolveAccountsTreeNode(node, currentPrefix, balances);
        }
    }
}

function _wealthDistributionSwitchScale(self) {
    if(self.checked) {
        _wealthDistribution("logarithmic", true);
    }
    else {
        _wealthDistribution("linear", true);
    }
}
