## Delete pruned basic accounts:

delete from accounts where balance=0 and type=0;

## Delete old low-value transactions:

delete from transactions where value<1e5 and block_height<805463;

## Vacuum

vacuum full;

## Rebuild indices

reindex table accounts;
reindex table transactions;
