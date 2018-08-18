'use strict';

var accountHashRegExp = new RegExp('^NQ[A-Z0-9 ]{42}'),
    blockHashRegExp   = new RegExp('^[A-F0-9]{64}$');

var template = {
    blocklistBlock:            tmpl('template-blocklist-block'),
    blockInfo:                 tmpl('template-block-info'),
    txInfo:                    tmpl('template-tx-info'),
    accountInfo:               tmpl('template-account-info'),
    accountTransaction:        tmpl('template-account-transaction'),
    accountBlock:              tmpl('template-account-block'),
    about:                     tmpl('template-about'),
    charts:                    tmpl('template-charts')
};

var $infobox        = document.getElementById('infobox'),
    $searchInput    = document.getElementById('search-input'),
    $status         = document.getElementById('status'),
    $height         = document.getElementById('height');

var directNavigationTargets = ['#charts', '#about'];

var default_colors = ['#3366CC','#DC3912','#FF9900','#109618','#990099','#3B3EAC','#0099C6','#DD4477','#66AA00','#B82E2E','#316395','#994499','#22AA99','#AAAA11','#6633CC','#E67300','#8B0707','#329262','#5574A6','#3B3EAC'];
default_colors = default_colors.concat(default_colors, default_colors);

var account_types = {
    0: 'Basic Account',
    1: 'Vesting Contract',
    2: 'Hashed Timelock Contract'
};

function _detectHashFormat(value) {
    value = value.toUpperCase();

    if(value.substr(0,2) === 'NQ') {
        value = value.replace(/[\+ ]/g, '').match(/.{4}/g).join(' ');
    }

    if(accountHashRegExp.test(value)) {
        return "Account Address";
    }
    else if(blockHashRegExp.test(value) /*&& value[0] === "0" && value[1] === "0"*/) {
        return "Block or Tx Hash";
    }
    else if(value.match(/^[0-9]*$/) && parseInt(value)) {
        return "Block Number";
    }
    else return false;
}

function _formatBalance(value) {
    var valueStr = '';

    // If the value has no decimal places below 0.01, display 2 decimals
    if(parseFloat(value.toFixed(2)) === value) {
        valueStr = value.toFixed(2);
    }
    // Otherwise, all required decimals will be displayed automatically
    else valueStr = value.toString();

    var ints = _formatThousands(valueStr.split('.')[0]);
    var decs = valueStr.split('.')[1];

    return ints + '.' + decs;
}

function _formatThousands(number, separator) {
    separator = separator || ' ';
    let reversed = number.split('').reverse();
    for(let i = 3; i < reversed.length; i += 4) {
        reversed.splice(i, 0, separator);
    }
    return reversed.reverse().join('');
}

function _formatSize(size) {
    // kilo, mega, giga, tera, peta, exa, zetta
    const unit_prefix = ['', 'K', 'M', 'G', 'T', 'P', 'E', 'Z'];

    for (let i = 0; i < unit_prefix.length - 1; i++) {
        if (size < 1000) return (Math.round(size * 100) / 100) + " " + unit_prefix[i] + "B";
        size = size / 1000;
    }
}

// From https://github.com/nimiq/secure-utils/utf8-tools/utf8-tools.js
function _formatTxData(data) {
    var bytes = Nimiq.BufferUtils.fromBase64(data);

    var transactionTags = {
        sendCashlink: new Uint8Array([0, 130, 128, 146, 135]),
        receiveCashlink: new Uint8Array([0, 139, 136, 141, 138]),
    };

    if (Nimiq.BufferUtils.equals(bytes, transactionTags.sendCashlink)) {
        return 'Charging cashlink';
    } else if (Nimiq.BufferUtils.equals(bytes, transactionTags.receiveCashlink)) {
        return 'Redeeming cashlink';
    } else {
        // TODO: Use native implementations if/when available
        var out = [], pos = 0, c = 0;
        while (pos < bytes.length) {
            var c1 = bytes[pos++];
            if (c1 < 128) {
                out[c++] = String.fromCharCode(c1);
            } else if (c1 > 191 && c1 < 224) {
                var c2 = bytes[pos++];
                out[c++] = String.fromCharCode((c1 & 31) << 6 | c2 & 63);
            } else if (c1 > 239 && c1 < 365) {
                // Surrogate Pair
                var c2 = bytes[pos++];
                var c3 = bytes[pos++];
                var c4 = bytes[pos++];
                var u = ((c1 & 7) << 18 | (c2 & 63) << 12 | (c3 & 63) << 6 | c4 & 63) - 0x10000;
                out[c++] = String.fromCharCode(0xD800 + (u >> 10));
                out[c++] = String.fromCharCode(0xDC00 + (u & 1023));
            } else {
                var c2 = bytes[pos++];
                var c3 = bytes[pos++];
                out[c++] =
                String.fromCharCode((c1 & 15) << 12 | (c2 & 63) << 6 | c3 & 63);
            }
        }
        return out.join('');
    }
}

function _labelAddress(address, shorten) {
    var label = AddressBook.getLabel(address);

    if(label)        return label;
    else if(shorten) return address.substr(0, 20) + '…';
    else             return address;
}

function _getAccountInfo(address, callback) {
    address = address.replace(/ /g, '+');
    fetch(apiUrl + '/account/' + address).then(function(response) {
        response.json().then(function(data) {
            if(data.error) alert('Error: ' + data.error);
            if(!data) alert('No data received from https://api.nimiq.watch/account/' + address + '!');

            if(data.type === 1) { // Vesting
                return _populateComputedVestingData(data, callback);
            }

            callback(data);
        });
    });
}

function _populateComputedVestingData(account, callback) {
    if(latestBlockHeight === 0) return setTimeout(_populateComputedVestingData, 200, account, callback);

    account.availableBalance = _calculateVestingAvailableBalance(account.balance, account.data);
    account.steps = _calculateVestingSteps(account.data);

    callback(account);
}

function _calculateVestingAvailableBalance(balance, data) {
    return (balance - data.vestingTotalAmount)
        + Math.min(
            data.vestingTotalAmount,
            Math.floor((latestBlockHeight - data.vestingStart) / data.vestingStepBlocks) * data.vestingStepAmount
        );
}

function _calculateVestingSteps(data) {
    var steps = [];
    var numberSteps = Math.ceil(data.vestingTotalAmount / data.vestingStepAmount);

    for (var i = 1; i <= numberSteps; i++) {
        var stepHeight = data.vestingStart + i * data.vestingStepBlocks;
        var stepHeightDelta = stepHeight - latestBlockHeight;
        var timestamp = Math.round(Date.now() / 1000) + stepHeightDelta * Nimiq.Policy.BLOCK_TIME;
        var amount = (i < numberSteps && data.vestingStepAmount) || data.vestingTotalAmount - (i - 1) * data.vestingStepAmount;

        steps.push({
            height: stepHeight,
            timestamp: timestamp,
            amount: amount,
            isFuture: stepHeight > latestBlockHeight
        });
    }

    return steps;
}

function loadMoreTransactions(self, address) {
    var urlAddress = address.replace(/ /g, '+');
    var limit = 10;
    var page  = parseInt(self.getAttribute('data-page'));
    var skip  = (page - 1) * limit;

    fetch(apiUrl + '/account-transactions/' + urlAddress + '/' + limit + '/' + skip).then(function(response) {
        response.json().then(function(transactions) {
            if(!transactions) alert('No data from https://api.nimiq.watch/account-transactions/' + urlAddress + '/' + limit + '/' + skip + '!');

            var list = document.createDocumentFragment();
            var item;

            for(var i = transactions.length - 1; i >= 0; i--) {
                transactions[i].isReceiver = transactions[i].receiver_address === address;

                item = document.createElement('div');
                item.innerHTML = template.accountTransaction(transactions[i]);

                list.appendChild(item.getElementsByClassName('event-item')[0]);
            }

            if(transactions.length < limit) {
                var notice = document.createElement('div');
                notice.classList.add('no-more');
                notice.textContent = 'No earlier transactions';
                list.appendChild(notice);
            }

            self.parentNode.insertBefore(list, self);

            if(transactions.length === limit) {
                self.setAttribute('data-page', parseInt(self.getAttribute('data-page')) + 1 );
            }
            else {
                self.parentNode.removeChild(self);
            }
        });
    });
}

function loadMoreBlocks(self, address) {
    var urlAddress = address.replace(/ /g, '+');
    var limit = 10;
    var page  = parseInt(self.getAttribute('data-page'));
    var skip  = (page - 1) * limit;

    fetch(apiUrl + '/account-blocks/' + urlAddress + '/' + limit + '/' + skip).then(function(response) {
        response.json().then(function(blocks) {
            if(!blocks) alert('No data from https://api.nimiq.watch/account-blocks/' + urlAddress + '/' + limit + '/' + skip + '!');

            var list = document.createDocumentFragment();
            var item;

            for(var i = blocks.length - 1; i >= 0; i--) {
                item = document.createElement('div');
                item.innerHTML = template.accountBlock(blocks[i]);

                list.appendChild(item.getElementsByClassName('event-item')[0]);
            }

            if(blocks.length < limit) {
                var notice = document.createElement('div');
                notice.classList.add('no-more');
                notice.textContent = 'No earlier blocks';
                list.appendChild(notice);
            }

            self.parentNode.insertBefore(list, self);

            if(blocks.length === limit) {
                self.setAttribute('data-page', parseInt(self.getAttribute('data-page')) + 1 );
            }
            else {
                self.parentNode.removeChild(self);
            }
        });
    });
}

function switchAccountHistory(selection) {
    var $transactions = document.getElementById('infobox').getElementsByClassName('accountinfo-transactions')[0];
    var $blocks       = document.getElementById('infobox').getElementsByClassName('accountinfo-blocks')[0];

    if(selection === 'transactions') {
        $transactions.classList.remove('hidden');
        $blocks.classList.add('hidden');
    }
    else {
        $transactions.classList.add('hidden');
        $blocks.classList.remove('hidden');
    }
}

function _getBlockInfo(identifier, callback, errback) {
    identifier = encodeURIComponent(identifier);
    fetch(apiUrl + '/block/' + identifier).then(function(response) {
        response.json().then(function(data) {
            if(data.error) {
                if(errback) errback(data);
                else if(data.error !== 'Block not found') alert('Error: ' + data.error);
            }
            if(!data) {
                if(errback) errback(null);
                else alert('No data received from https://api.nimiq.watch/block/' + identifier + '!');
            }

            if(data.extra_data) {
                var extra_data = Nimiq.BufferUtils.fromBase64(data.extra_data);

                var buf;
                var nullByteIndex = extra_data.indexOf(0);

                if(nullByteIndex > 0) {
                    buf = extra_data.slice(0, nullByteIndex);
                } else {
                    buf = extra_data;
                }

                // Check if we can convert the buffer into ASCII
                if(buf.every(function(c) {return c >= 32 && c <= 126;})) {
                    data.extra_data = Nimiq.BufferUtils.toAscii(buf);

                    if(nullByteIndex > 0) {
                        // Append rest of extra data as base64
                        data.extra_data += ' ' + Nimiq.BufferUtils.toBase64(extra_data.slice(nullByteIndex + 1));
                    }
                }
            }

            callback(data);
        });
    });
}

function _getTransactionInfo(identifier, callback) {
    identifier = encodeURIComponent(identifier);
    fetch(apiUrl + '/transaction/' + identifier).then(function(response) {
        response.json().then(function(data) {
            if(data.error && data.error !== 'Transaction not found') alert('Error: ' + data.error);
            if(!data) alert('No data received from https://api.nimiq.watch/transaction/' + identifier + '!');
            callback(data);
        });
    });
}

function _getBlockListInfo(height, callback) {
    _getBlockInfo(height, callback, function() {
        // On error, retry after 2 seconds
        setTimeout(_getBlockListInfo, 2000, height, callback);
    });
}

var blocklistBuilt = false;
var latestBlocks = [];

function _buildListOfLatestBlocks(self) {
    var limit = 20;
    var skip = 0;

    if(!self) {
        if(blocklistBuilt !== false) return;
        blocklistBuilt = null;
    }
    else {
        skip = blocklistNode.getElementsByClassName('blocklist-block').length;
    }


    fetch(apiUrl + '/latest/' + limit + '/' + skip).then(function(response) {
        response.json().then(function(data) {
            if(!blocklistBuilt) blocklistNode.removeChild(blocklistNode.getElementsByTagName('div')[0]);

            if(!data) alert('No data received from https://api.nimiq.watch/latest/' + limit + '/' + skip + '!');

            latestBlockHeight = Math.max(latestBlockHeight, data[data.length - 1].height);

            if(self) data.reverse();

            for(var i = 0; i < data.length; i++ ) {
                _addBlockToListOfLatestBlocks(data[i], !!self);
            }

            if(data.length < limit) {
                self && self.parentNode.removeChild(self);

                var notice = document.createElement('div');
                notice.classList.add('no-more');
                notice.textContent = 'No earlier blocks';
                blocklistNode.appendChild(notice);
            }

            if(!self) {
                // <button class="event-loadmore" onclick="loadMoreTransactions(this, '{%=o.address%}')" data-page="2">Load more</button>
                var button = document.createElement('button');
                button.classList.add('event-loadmore');
                button.setAttribute('onclick', '_buildListOfLatestBlocks(this)');
                button.textContent = 'Load more';
                blocklistNode.parentNode.appendChild(button);
            }

            blocklistBuilt = true;
        });
    });
}

var blocklistNode = document.getElementById('blocklist');

function _addBlockToListOfLatestBlocks(blockInfo, append) {
    if(!blockInfo || blockInfo.error) return;

    var item = document.createElement('div');
    item.classList.add('blocklist-block');

    item.innerHTML = template.blocklistBlock(blockInfo);

    append && blocklistNode.appendChild(item) || blocklistNode.insertBefore(item, blocklistNode.firstChild);
}

function _onHashChange(e) {
    try {
        ga('set', 'page', location.pathname + location.search + location.hash);
        ga('send', 'pageview');
    } catch(e) {}

    var value = window.location.hash;

    // Remove leading '#'
    if(value[0] === "#") value = value.substring(1);
    // Remove eventual leading forward-slash /
    if(value[0] === "/") value = value.substring(1);

    // Filter eventual URI encoding
    value = decodeURIComponent(value);

    // Clean leading/trailing whitespace
    value = value.trim();

    if(value.substr(0,2) === 'NQ') {
        value = value.replace(/[\+ ]/g, '').match(/.{4}/g).join(' ');
    }

    if(value === "" || value === "search") {
        // Display homepage
        $infobox.textContent = "";
        $searchInput.value = "";
        value === "search" && $searchInput.focus();
        window.scrollTo(0, 0);
    }
    else if(value === "about") {
        $infobox.innerHTML = template.about();
        window.scrollTo(0, $infobox.offsetTop - 100);
    }
    else if(value === "charts") {
        $infobox.innerHTML = template.charts();
        window.scrollTo(0, $infobox.offsetTop - 100);
    }
    else if(value === "chart-wealth-distribution") {
        _wealthDistribution();
    }
    else if(value === "chart-global-hashrate") {
        _globalHashrate();
    }
    else if(value === "chart-transactions-per-block") {
        _transactionsPerBlock();
    }
    else if(value === "chart-hashing-distribution") {
        _hashingDistribution();
    }
    else {
        var format = _detectHashFormat(value);
        document.getElementById('hash-format').innerHTML = format || "<em>none</em>";

        $searchInput.value = value;

        switch(format) {
            case "Account Address":
                _getAccountInfo(value, function(accountInfo) {
                    if(accountInfo.error) return;

                    accountInfo.accountTransaction = template.accountTransaction;
                    accountInfo.accountBlock       = template.accountBlock;

                    $infobox.innerHTML = template.accountInfo(accountInfo);
                    window.scrollTo(0, $infobox.offsetTop - 100);
                });
                break;
            case "Block or Tx Hash":
                value = Nimiq.BufferUtils.toBase64(Nimiq.BufferUtils.fromHex(value));
            case "Block Number":
                _getBlockInfo(value, function(blockInfo) {
                    if(!blockInfo || blockInfo.error) {
                        _getTransactionInfo(value, function(txInfo) {
                            if(!txInfo || txInfo.error) {
                                alert("That block or tx hash cannot be found.");
                                return;
                            }

                            $infobox.innerHTML = template.txInfo(txInfo);
                            window.scrollTo(0, $infobox.offsetTop - 100);
                        });
                        return;
                    }

                    $infobox.innerHTML = template.blockInfo(blockInfo);
                    window.scrollTo(0, $infobox.offsetTop - 100);
                });
                break;
            default:
                alert("Format cannot be detected.");
        }
    }
}

$searchInput.addEventListener('input', function(e) {
    document.getElementById('hash-format').innerHTML = _detectHashFormat(this.value) || "<em>none</em>";
});

document.getElementById('search-form').addEventListener('submit', function(e) {
    e.preventDefault();

    if(!nimiqLoaded) return;

    var value = $searchInput.value.trim().replace(/ /g, '+');

    if(window.location.hash === "#" + value) {
        // The hashchange event does not trigger if the hash does not change
        // Thus we manually trigger the function
        window.onhashchange();
    }

    window.location.hash = "#" + value;
});

function _linkClicked(self) {
    if(window.location.hash === self.hash) {
        // The browser does not do anything, if the hash is already in the URL
        // Thus we need to trigger the link manually
        _onHashChange();
    }
}

var hasTouch = 'ontouchstart' in window || navigator.msMaxTouchPoints;
hasTouch || $searchInput.focus();
if(directNavigationTargets.indexOf(window.location.hash) > -1) _onHashChange();

// Address book (https://github.com/nimiq/nimiq-utils/blob/master/address-book/address-book.js)

var AddressBook = {
    getLabel: function(address) {
        return AddressBook.BOOK[address] || null;
    }
}

AddressBook.BOOK = {
    // Mainnet Pools
    'NQ48 8CKH BA24 2VR3 N249 N8MN J5XX 74DB 5XJ8': 'Skypool',
    'NQ58 U4HN TVVA FCRS VLYL 8XTL K0B7 2FVD EC6B': 'Skypool Gundam',
    'NQ88 D1R3 KR4H KSY2 CQYR 5G0C 80X4 0KED 32G8': 'Skypool Bebop',
    'NQ43 GQ0B R7AJ 7SUG Q2HC 3XMP MNRU 8VM0 AJEG': 'Skypool Pandaman',
    'NQ74 FLQL DRE3 99PF CET0 3N7D JKLF MQP6 87KS': 'Skypool SamuraiChamploo',
    'NQ46 UTKP D8A9 04RS A1LL GPR8 BE4L G2BD FYSX': 'Skypool Hehe',
    'NQ32 473Y R5T3 979R 325K S8UT 7E3A NRNS VBX2': 'SushiPool',
    'NQ76 R7R0 DCKG N0RC 35XK ULTS N41J VGA7 3CMP': 'Porky Pool',
    'NQ10 76JC KSSE 5S2R U401 NC5P M3N2 8TKQ YATP': 'Nimiqchain.info Pool',
    'NQ33 DH76 PHUK J41Q LX3A U4E0 M0BM QJH9 QQL1': 'Beeppool',
    'NQ90 P00L 2EG5 3SBU 7TB5 NPGG 8FNL 4JC7 A4ML': 'NIMIQ.WATCH Pool',
    'NQ11 P00L 2HYP TUK8 VY6L 2N22 MMBU MHHR BSAA': 'Nimpool.io',
    'NQ04 3GHQ RAV6 75FD R9XA VS7N 146Q H230 2KER': 'Nimiqpool.com',
    'NQ07 SURF KVMX XF1U T3PH GXSN HYK1 RG71 HBKR': 'Nimiq.Surf',
    'NQ90 PH1L 7MT2 VTUH PJYC 17RV Q61B 006N 4KP7': 'PhilPool',
    'NQ06 NG1G 83YG 5D59 LK8G Y2JB VYTH EL6D 7AKY': 'Nimbus Pool',
    'NQ18 37VM K2Y5 2HPY 5U80 2E0U VHUJ R7RK QSNE': 'Sirius Pool',
    'NQ64 55BR 87SX AFHN XB27 M7BQ F7CY L4FV 2TG2': 'HexaPool',
    'NQ67 AQB4 RHCC AU2T 4CC0 ETUT X1XB SSFL V9UQ': 'mineNIM Pool',
    'NQ37 47US CL1J M0KQ KEY3 YQ4G KGHC VPVF 8L02': 'Nimiqpocket Pool',
    'NQ24 900S EKCD HGDA TN30 8UET LX2F 75U1 G1A1': 'Nimiqo.com',

    // Mainnet Services
    'NQ15 MLJN 23YB 8FBM 61TN 7LYG 2212 LVBG 4V19': 'NIM Activation',
    'NQ09 VF5Y 1PKV MRM4 5LE1 55KV P6R2 GXYJ XYQF': 'Nimiq Foundation',
    'NQ19 YG54 46TX EHGQ D2R2 V8XA JX84 UFG0 S0MC': 'Nimiq Charity',
    'NQ93 RL4N M68G 9DEN CKU9 HJRE HYRJ CYRE J0XB': 'nimiqfaucet.io',
    'NQ94 GSXP KNG0 K5YV HFJ1 PYAQ Y5D1 XTQ1 SLFP': 'Nimiq-Faucet.surge.sh',
    'NQ80 PAYN R93R D0H4 BH8T KPRT SBYE 30A3 PHDL': 'PayNim.app',
    'NQ85 TEST VY0L DR6U KDXA 6EAV 1EJG ENJ9 NCGP': 'Discord NIM Tip Bot',

    // Testnet
    'NQ31 QEPR ED7V 00KC P7UC P1PR DKJC VNU7 E461': 'pool.nimiq-testnet.com',
    'NQ36 P00L 1N6T S3QL KJY8 6FH4 5XN4 DXY0 L7C8': 'NIMIQ.WATCH Test-Pool',
    'NQ50 CXGC 14C6 Y7Q4 U3X2 KF0S 0Q88 G09C PGA0': 'SushiPool TESTNET',
}
