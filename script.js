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
    charts:                    tmpl('template-charts'),
    labels:                    tmpl('template-labels'),
};

var $infobox        = document.getElementById('infobox'),
    $searchInput    = document.getElementById('search-input'),
    $status         = document.getElementById('status'),
    $height         = document.getElementById('height');

var directNavigationTargets = ['#about', '#charts', '#labels'];

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
        return "Tx or Block Hash";
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
    let reversed = number.toString().split('').reverse();
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

function _isHTLCCreation(buf) {
    try {
        Nimiq.Address.unserialize(buf); // sender address
        Nimiq.Address.unserialize(buf); // recipient address
        const hashAlgorithm = /** @type {Hash.Algorithm} */ buf.readUint8();
        Nimiq.Hash.unserialize(buf, hashAlgorithm);
        const hashCount = buf.readUint8(); // hash count
        buf.readUint32(); // timeout

        if (hashCount === 0) {
            throw new Error('Invalid hashCount');
        }

        // Blacklist Argon2 hash function.
        if (hashAlgorithm === Nimiq.Hash.Algorithm.ARGON2D) {
            throw new Error('Invalid algorithm');
        }

        if (buf.readPos !== buf.byteLength) {
            throw new Error('Invalid length');
        }
    } catch (e) {
        return false;
    }

    return true;
}

function _isVestingCreation(buf) {
    switch (buf.length) {
        case Nimiq.Address.SERIALIZED_SIZE + 4:
        case Nimiq.Address.SERIALIZED_SIZE + 16:
        case Nimiq.Address.SERIALIZED_SIZE + 24:
            return true;
        default:
            return false;
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
    } else if (_isHTLCCreation(bytes)) {
        return '<Creation: Hashed Timelock Contract>';
    // } else if (_isVestingCreation(bytes)) {
    //     return '<Creation: Vesting Contract>';
    } else {
        if (typeof TextDecoder !== 'undefined') {
            const decoder = new TextDecoder('utf-8');
            return decoder.decode(bytes);
        }

        // Fallback for unsupported TextDecoder.
        // Note that this fallback can result in a different decoding for invalid utf8 than the native implementation.
        // This is the case when a character requires more bytes than are left in the array which is not handled here.
        const out = [];
        let pos = 0;
        let c = 0;
        while (pos < bytes.length) {
            const c1 = bytes[pos++];
            if (c1 < 128) {
                out[c++] = String.fromCharCode(c1);
            } else if (c1 > 191 && c1 < 224) {
                const c2 = bytes[pos++];
                out[c++] = String.fromCharCode((c1 & 31) << 6 | c2 & 63);
            } else if (c1 > 239 && c1 < 365) {
                // Surrogate Pair
                const c2 = bytes[pos++];
                const c3 = bytes[pos++];
                const c4 = bytes[pos++];
                const u = ((c1 & 7) << 18 | (c2 & 63) << 12 | (c3 & 63) << 6 | c4 & 63) - 0x10000;
                out[c++] = String.fromCharCode(0xD800 + (u >> 10));
                out[c++] = String.fromCharCode(0xDC00 + (u & 1023));
            } else {
                const c2 = bytes[pos++];
                const c3 = bytes[pos++];
                out[c++] = String.fromCharCode((c1 & 15) << 12 | (c2 & 63) << 6 | c3 & 63);
            }
        }
        return out.join('');
    }
}

function _formatTimeAgo(timestamp) {
    var secondsPast = parseInt(Date.now() / 1000) - timestamp;

    if (secondsPast < 60) return secondsPast + ' sec';
    if (secondsPast < 3600)  {
        var secs = (secondsPast % 60).toString().padStart(2, '0');
        return parseInt(secondsPast / 60) + ':' + secs + ' min';
    }

    var hours = parseInt(secondsPast / 60 / 60);
    var mins = parseInt(secondsPast / 60 % 60).toString().padStart(2, '0');
    var secs = (secondsPast % 60).toString().padStart(2, '0');
    return hours + ':' + mins + ':' + secs;
}

function _updateTimeAgo() {
    const nodes = document.getElementsByClassName('update-time-ago');
    for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        node.textContent = _formatTimeAgo(node.getAttribute('data-timestamp'));
    }
}
setInterval(_updateTimeAgo, 1000);

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
    return (balance - data.total_amount)
        + Math.min(
            data.total_amount,
            Math.max(0, Math.floor((latestBlockHeight - data.start) / data.step_blocks)) * data.step_amount
        );
}

function _calculateVestingSteps(data) {
    var steps = [];
    var numberSteps = Math.ceil(data.total_amount / data.step_amount);

    for (var i = 1; i <= numberSteps; i++) {
        var stepHeight = data.start + i * data.step_blocks;
        var stepHeightDelta = stepHeight - latestBlockHeight;
        var timestamp = Math.round(Date.now() / 1000) + stepHeightDelta * Nimiq.Policy.BLOCK_TIME;
        var amount = (i < numberSteps && data.step_amount) || data.total_amount - (i - 1) * data.step_amount;

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
                self.setAttribute('data-page', page + 1 );
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
                self.setAttribute('data-page', page + 1 );
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


var pendingBlockRequests = 0;
var waitingBlockRequests = [];

function _getBlockInfo(identifier, callback, errback) {
    identifier = encodeURIComponent(identifier);

    if (pendingBlockRequests >= 5) { // Half of the rate limit, to be safe
        waitingBlockRequests.push([identifier, callback, errback]);
        return;
    }
    pendingBlockRequests += 1;

    fetch(apiUrl + '/block/' + identifier).then(function(response) {
        pendingBlockRequests -= 1;

        // Process queue
        if (waitingBlockRequests.length > 0) {
            var args = waitingBlockRequests.shift();
            setTimeout(_getBlockInfo, 200, args[0], args[1], args[2]);
        }

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
    else if(value === "labels") {
        requestAnimationFrame(() => {
            $infobox.innerHTML = template.labels(AddressBook.BOOK);
            window.scrollTo(0, $infobox.offsetTop - 100);
        });
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
            case "Tx or Block Hash":
                value = Nimiq.BufferUtils.toBase64(Nimiq.BufferUtils.fromHex(value));
                _getTransactionInfo(value, function(txInfo) {
                    if(!txInfo || txInfo.error) {
                        _getBlockInfo(value, function(blockInfo) {
                            if(!blockInfo || blockInfo.error) {
                                alert("That transaction or block hash cannot be found.");
                                return;
                            }

                            $infobox.innerHTML = template.blockInfo(blockInfo);
                            window.scrollTo(0, $infobox.offsetTop - 100);
                        });
                        return;
                    }

                    $infobox.innerHTML = template.txInfo(txInfo);
                    window.scrollTo(0, $infobox.offsetTop - 100);
                });
                break;
            case "Block Number":
                _getBlockInfo(value, function(blockInfo) {
                    if(!blockInfo || blockInfo.error) {
                        alert("That block number cannot be found.");
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
