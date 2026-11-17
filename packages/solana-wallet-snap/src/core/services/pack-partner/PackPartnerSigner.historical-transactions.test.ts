import type { ExtendedKeyringAccount } from '@metamask/snap-networks-utils';
import { getBase64Encoder, getTransactionDecoder } from '@solana/kit';

import { Network } from '../../constants/solana';
import { fromTransactionToBase64String } from '../../sdk-extensions/codecs';
import type { SolanaConnection } from '../connection';
import { PackPartnerSigner } from './PackPartnerSigner';

/** Public historical transactions, fetched read-only through Solana RPC. */
const examples = [
  {
    name: 'buy — mainnet, sponsored fees',
    expectedStandard: undefined,
    scope: Network.Mainnet,
    wire: 'Ao/pwyfkVcjtKcM9gQnqBjcmEg3apwdz0AgbpZetzxbrzzmBoPWWAODHtioYkUqMTm2BHPfjDbhV/6pZcDpZRwHl0/fY5Um0/eee0jTanOkflnAKYwZyd6VGDT+RB8AwFGlnrLjRznFbYOo9qWzUQrn9d/bOaWu6ADHFbfmqObYAAgEECOd71hNwnx/P2MtkMWPpufVol1UMbaqjUg49GQh2vvz+WyBHFpjPc1ZkhlvOkuJEcTLGq5ucF80zsPlAhhcwchOFtAmSSHHIVGp/55P62LZYJDvRyqScl0Cxd670MJ8ga7RlmLExWVGoedg0hIcp1OXnzRLoyQAas9eXDuhNa6QPAwZGb+UhFzL/7K26csOb57yM5bvF9xJrLEObOkAAAADG+nrzvtutOj1l82qryXQxsbvkwtL24OR8pgIDRS9dYQVKU1qZKSEGTSTocWDaOHx8NbXdvJK7geQfqEBBBUSNBt324ddloZPZy+FGzut5rBy0he1fWzeROoz1hX7/AKkQMSg+50JJQoZ0tGBeTVLbWsFoyg2HLDnCRtIqLc0cVAQEAAUCgDgBAAYALGNjLTc1ODI1NDhjLWNmOGMtNDJjYi1iMThmLTFhOGQ3Njc0OWM4YTpvcGVuBwUCBQMBAQoMQHh9AQAAAAAGBAAJAxAnAAAAAAAA',
    user: '78ieXfmDY4ZG2t6PzY183YjpmpJkmzThgZHV6ZVxyare',
    amount: '25000000',
    nft: undefined,
  },
  {
    name: 'buy — mainnet, user-paid fees',
    expectedStandard: undefined,
    scope: Network.Mainnet,
    wire: 'AirY9ADUPLF1uY35OD5o+MewRkRbT9kcjfrzxyvEOsl+ifpvHzWE2yhMV/Ve8ZQ67ppoMyxc6spOIXVyn26UJQQ/F8p8JfsRAkJDwiEc3S8TFBQ9TDkORVsuREcmNyfHrcHeNj/kT03RlLujkFsC1MnRDAg2CuO5XNi8LiUaB5YIAgEECGJNNHW20O2pV1BOsKzdN1ewpY1n09GXow5Mo2HRzYRZ53vWE3CfH8/Yy2QxY+m59WiXVQxtqqNSDj0ZCHa+/P59POcox/X7/mcvmiR+j2xVwby+weHGSFx+r8ZAKM56mLRlmLExWVGoedg0hIcp1OXnzRLoyQAas9eXDuhNa6QPAwZGb+UhFzL/7K26csOb57yM5bvF9xJrLEObOkAAAADG+nrzvtutOj1l82qryXQxsbvkwtL24OR8pgIDRS9dYQVKU1qZKSEGTSTocWDaOHx8NbXdvJK7geQfqEBBBUSNBt324ddloZPZy+FGzut5rBy0he1fWzeROoz1hX7/AKlYKUzILvBiZaWB1VmM1DpZ1mxmyvop6q0XxjYIN/YTAwQEAAUCgDgBAAYBATFqdXBpdGVyLTEwODBjNTIzLWRjZjMtNGQxZC1iYTg5LTQ0ODUxNjE3MGQxYjpvcGVuBwUCBQMAAAoMQHh9AQAAAAAGBAAJAxAnAAAAAAAA',
    user: '7cjEct8b9jCAyQaCTefikqXkh9iU3j8BaUVdX7pWf3Lc',
    amount: '25000000',
    nft: undefined,
  },
  {
    name: 'buyback core — mainnet, fixture 1',
    expectedStandard: 'core',
    scope: Network.Mainnet,
    wire: 'Ao1V2IXY4fpPfIomQ2msIx6lNMeWEYWwB3VGfpIy8gj98LxIKva+ZKeb/IkFPiT33wLn1vma8SU6gw78BU/sCAAAS/q7YXSNNlO3/n/T7PWWmDSwf/9ruJJn/MO7zL6t6tiB2WqKDPOBik4z44r7IFqHIiOa5XjO/u8PYv+/gesKAgEJDud71hNwnx/P2MtkMWPpufVol1UMbaqjUg49GQh2vvz+Yk00dbbQ7alXUE6wrN03V7CljWfT0ZejDkyjYdHNhFl9POcox/X7/mcvmiR+j2xVwby+weHGSFx+r8ZAKM56mLRlmLExWVGoedg0hIcp1OXnzRLoyQAas9eXDuhNa6QPwy3OGLAejXmm1jr4Eax04M3cXWEny1SB7jST4bUjyzsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIyXJY9OJInxuz0QKRSODYMLWhOZ2v8QhASOe9jb6fhZpnp1Fpjwvz4eGn76FE9GJ9ohsIsCtacq5krP94RMHvUDBkZv5SEXMv/srbpyw5vnvIzlu8X3EmssQ5s6QAAAAK9UqxC9l6VCoJ73s5iJ3QzTlKTM6d+mzcl+vi0jW6dIxvp6877brTo9ZfNqq8l0MbG75MLS9uDkfKYCA0UvXWEFExowiZzlvpFS261pQXu3btWno/ikncgIScUmXjXgBAVKU1qZKSEGTSTocWDaOHx8NbXdvJK7geQfqEBBBUSNBt324ddloZPZy+FGzut5rBy0he1fWzeROoz1hX7/AKmtYi+9xoJU5dK/RNTQ/+YM7mbASJGDR17StZT16H3XpgYIAAUCkNADAAkHBAcAAQsJCQIOAAgACQMQJwAAAAAAAAYGAAIBCgUNAQENBAMKAgAKDBCcqAAAAAAABgwANGp1cGl0ZXItMTA4MGM1MjMtZGNmMy00ZDFkLWJhODktNDQ4NTE2MTcwZDFiOmJ1eWJhY2s=',
    user: '7cjEct8b9jCAyQaCTefikqXkh9iU3j8BaUVdX7pWf3Lc',
    amount: '11050000',
    nft: 'E8u1ezgQJrZ7CNFr6mx7LzSCtbwZL62hNngoqWcb1ZeS',
  },
  {
    name: 'buyback core — mainnet, fixture 2',
    expectedStandard: 'core',
    scope: Network.Mainnet,
    wire: 'AuZI6aKpJIgcKavhzCZU86fpWZVRIw3sSIdQ/M4F0wwrX+RemJ1hxrKJE49t4AFSqIuXSUS1uJsLQqle3eiy1w4PP/s+Ew6iZDav//qRzJ4H22mF2H1NleQaZYJRR76Pqfh/QL6mSFBLoX7em8N5QCNHQbzpRFFzhxcEKiaZfzMEAgEJDud71hNwnx/P2MtkMWPpufVol1UMbaqjUg49GQh2vvz+GJFckPA+y9Zk5lYi4X4ZV+gmsPdbYuD8zHFARjW2nesYi4DycDjvZ8pbu8w4VPL1LrcSiNjjCKkvD9HxjhO0thsFQoLtzbcuh+0YGobImMaaeC5r2fhbU+1VEYkgD3dBtGWYsTFZUah52DSEhynU5efNEujJABqz15cO6E1rpA8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIyXJY9OJInxuz0QKRSODYMLWhOZ2v8QhASOe9jb6fhZpnp1Fpjwvz4eGn76FE9GJ9ohsIsCtacq5krP94RMHvUDBkZv5SEXMv/srbpyw5vnvIzlu8X3EmssQ5s6QAAAAK9UqxC9l6VCoJ73s5iJ3QzTlKTM6d+mzcl+vi0jW6dIxvp6877brTo9ZfNqq8l0MbG75MLS9uDkfKYCA0UvXWEFSlNamSkhBk0k6HFg2jh8fDW13bySu4HkH6hAQQVEjQv8U+R5FIEONWiY3Ji7Ss2BYifdpsqQNp1jAdim/bTcBt324ddloZPZy+FGzut5rBy0he1fWzeROoz1hX7/AKmUZVQrFDE+F8zFxZJFYnkZ9lH8kSOmOB05ShGfm93xEwYIAAUCkNADAAkHAgcAAQwJCQIOAAgACQMQJwAAAAAAAAYGAAMBCgUNAQENBAQKAwAKDIDspwkAAAAABgsAMnNsYWJ6LWNjNzkxMTcyLWJjNTgtNDk0OS1hZTg1LTRiMGQ1ZTNhMjVlNjpidXliYWNr',
    user: '2euLumARMfXPW4REBXoYrLdLoWqTmXaHUNXD4ZJiPpAe',
    amount: '162000000',
    nft: '2epARjc84XVnkTcWgaXSxF4w6ZDT7Usj5aRnsmaQmRG1',
  },
  {
    name: 'buyback pnft — mainnet',
    expectedStandard: 'pnft',
    scope: Network.Mainnet,
    wire: 'AknjFUYZLqNPYEE1EoCYXqQf0b2Wr5+VQu9XLVyxtOoliYnOo2giLfMeqA14tVfHNX8YhdJ6Bp4m6pleWZLGnQ/dK+RqJxYR++wFg/eT4+8YdiohHgxoXSMyUPXBGDkW4eNp4UNKM2KtqxMaaRLk2umD9vNegTtwmxYqiHLfLkECAgELFOd71hNwnx/P2MtkMWPpufVol1UMbaqjUg49GQh2vvz+6jelpP6ngIUGEkZ26rMCJDVTRukoOr7HBlMSKsXTkYICAqpf+vfayaaklrdnjFsiAgzN5PPUOppdH/k6Nub773ABzc4cxQPjv6YySfiM5IMM33nAAKkkpIRiOm0OhopXggOMvxyIyUm6w8597rjHpBrKimuYD+fBB9T5wkNjsmSGL6qu4tBNUcd0AtHsyjjzrFdY9hZ94IH1//TM7syhjbRlmLExWVGoedg0hIcp1OXnzRLoyQAas9eXDuhNa6QPxjv5oKTlIdks2S+Dsp7IRDKPwoXLw+cqVAnl0xTF+o3tMpIdJriQEn2QEHbF4fJsFhpY+xYtkZej/qHX0QxZRwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAASdCg0GaJEYgexy1fZPHRAk4bNxy+HSdW3Qs9cACblkWMlyWPTiSJ8bs9ECkUjg2DC1oTmdr/EIQEjnvY2+n4WQiv+JTD+mfAFjow8jSjPTRn8DqhZBcxXrS4FCe9m6btAwZGb+UhFzL/7K26csOb57yM5bvF9xJrLEObOkAAAADafU3RkTY78kmJlB2plv828QvZ9bqLIL2kz7T6nOtrcAVKU1qZKSEGTSTocWDaOHx8NbXdvJK7geQfqEBBBUSNC3BlsePRfEU4nVJ/awTDzVi4bHMaoP21SbbRvAP4KUYL/FPkeRSBDjVomNyYu0rNgWIn3abKkDadYwHYpv203Aan1RcYe9FmNdrUBFX9wsDBJMaPIVZ1pdu6y18IAAAABt324ddloZPZy+FGzut5rBy0he1fWzeROoz1hX7/AKmxRaUI4XYNSMpP5dyIl1cTUnEJgOLbyDAtF+U4s0mU+QYQEQQBBREKAg4IBwEACRITCwwQCzEAAQAAAAAAAAAADQAFAiC/AgANAAkDECcAAAAAAAATAwYDAAkDADcFDwAAAAATAwQAAQEJDwAnY2MtMDJhZjEyYmEtNzgzMS00YWZlLWFjMGQtNGVmOTgyMjZmYjQx',
    user: 'GmHciaaar2PjaeFBAYVEzyeQKkhgjD4uZbwACvesWiYq',
    amount: '252000000',
    nft: '5y9GsvBdAYrTHBwybZRJQVEkEVfcyr3v9WqzRktJxdue',
  },
  {
    // https://solscan.io/tx/3fhT71ykVsxVALjpmriH5gBXM1M34hYNXx9Cy6Tcev2HQwfRcrNRN69rfsWsP5u29MraiC75VtmCbAVwCuqZEfEs
    name: 'buyback nft — mainnet, fixture 1',
    expectedStandard: 'nft',
    scope: Network.Mainnet,
    wire: 'AoVnuca0nOpFIifngY8a3qznsieXT5Up4g85aTbi5mCVHMfTTO+GCwgRZX4E67gXQI5O36rk+miLzjAo9jdQxQSz6NNIgLFDTyDHuDcgGSdWMDvzMoSvQLbAM2OCMTIHW5rX0P6vX7jZZ+wL41XESvb9lYGI1bcWRSc9JyUTKL4FAgEKEed71hNwnx/P2MtkMWPpufVol1UMbaqjUg49GQh2vvz+z0OtU2mIuJsIUs2IKsNs5/tS98vqnTWqP257krc8QJMxaboBz6+BuB+JKfxE4dFrVEx2SLv551FuiCoeLOMU0VYciNCFDMiw5QvdwcPJwvDxaC5hFJoeNy4kAXyZazAJjax95QgrB2E3MUdqy7mJ5qSPtNoOUnEgwbNpMKIHZxy0ZZixMVlRqHnYNISHKdTl580S6MkAGrPXlw7oTWukD9ONKqOcu9j446Hn7npn7T4+yF83uzGCsGi9YItTtTxyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAyBgykz9/yLFU/tjpxdMBMCCQrG4BRxSwIdhqtPOAkVYyXJY9OJInxuz0QKRSODYMLWhOZ2v8QhASOe9jb6fhZAwZGb+UhFzL/7K26csOb57yM5bvF9xJrLEObOkAAAADG+nrzvtutOj1l82qryXQxsbvkwtL24OR8pgIDRS9dYQRH8ysyA5xxDb+HIw9Nkxz35c6sACy2LMzhraQMTB34BUpTWpkpIQZNJOhxYNo4fHw1td28kruB5B+oQEEFRI0LcGWx49F8RTidUn9rBMPNWLhscxqg/bVJttG8A/gpRgan1RcYe9FmNdrUBFX9wsDBJMaPIVZ1pdu6y18IAAAABt324ddloZPZy+FGzut5rBy0he1fWzeROoz1hX7/AKkGa3Ths5C8A3pd0LuJEfxc7IpkosFQuQbfOIzL+aY0UwcKAAUCkNADAA4RBAECDAgGDg4OAQAHDxAJDg4LMQABAAAAAAAAAAAKAAkDECcAAAAAAAAJBgADAQsHEAEBEAQFCwMACgyAOa8eAAAAAAYQAwQAAQEJDQAvY2MtYWRlYzU1ZWMtMmNjMi00NDc2LWE3MjQtODNiMjk5N2E3YWIwOmJ1eWJhY2s=',
    user: 'Ex5FM97zzczYpmKcDEQazswrVZW9jh5i3tDe7Sr4LtBU',
    amount: '514800000',
    nft: '4NGjdY9LHWhbWGysoeXTgrQq8CLNm5SzZKuHfzerXByW',
  },
  {
    // https://solscan.io/tx/4xNjr79ss5zHmdhokUBwPDzF2yRJyFn9E2MeWeKMZXJJLuE7GAeLw8njuYLxH6JZZu1yL8Z2dGAsE5fwNp5YcnaG
    name: 'buyback nft — mainnet, fixture 2',
    expectedStandard: 'nft',
    scope: Network.Mainnet,
    wire: 'AsXN2y5t2S62LEiVZTD9Sfvww98F1DwIeob3YLEpbeH2+pHMQPOMowN4bi2Cxss/lrSbaw1MDlxOXNvcEo4LggVSCQlD856kmzgcB7m5up5Cc+3yA7i7hgn0fMAjknukCxdxUfrvXvUWi1RD8uF1bX1LzQiBcrpbCUIR6Fn5IWQFAgEKEed71hNwnx/P2MtkMWPpufVol1UMbaqjUg49GQh2vvz+d7RGxUlJnrWg819XyJntTexobYRzMmVvvJrwuooqv8YmBug0Aq4mZGzTgoqIQ2SXSrixOQ5mtfvaIAqO2jBDAZyHpS+OtKu5uykF75lG6P+fAirAyg50rjf+IDm3/6BHtGWYsTFZUah52DSEhynU5efNEujJABqz15cO6E1rpA+1UUpVJCHYGwlUQ3VX25Wgm9HqXdOyHBDC+d8HYY4CFsc1RkmUmAR1E2mdb87t1cUkwBx1/n2fCHMyLLfkj7SHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYnUUV1FI7SeWs2BWwIEjegVLU2forE10YH9CQ6fYcOoyXJY9OJInxuz0QKRSODYMLWhOZ2v8QhASOe9jb6fhZAwZGb+UhFzL/7K26csOb57yM5bvF9xJrLEObOkAAAADG+nrzvtutOj1l82qryXQxsbvkwtL24OR8pgIDRS9dYQVKU1qZKSEGTSTocWDaOHx8NbXdvJK7geQfqEBBBUSNC3BlsePRfEU4nVJ/awTDzVi4bHMaoP21SbbRvAP4KUYF1ziwWsWsCFVbhBgwBl/VQRLDm+zjvuMF76eY3jMAdgan1RcYe9FmNdrUBFX9wsDBJMaPIVZ1pdu6y18IAAAABt324ddloZPZy+FGzut5rBy0he1fWzeROoz1hX7/AKnwMlBB54eiEqrTEp95e2EdyCoP/JLarIc/pomVwtl+agcKAAUCkNADAA0RBQEDDggCDQ0NAQAHDxAJDQ0LMQABAAAAAAAAAAAKAAkDECcAAAAAAAAJBgAGAQsHEAEBEAQECwYACgwgTI8EAAAAAAYQAwUAAQEJDAAvY2MtNTUyYjZkMTAtNTE3Ny00MGNhLWE1YjYtOWE2ZTM0MDc2ZDA5OmJ1eWJhY2s=',
    user: '94GxJNBphsRb6WPmtATJ8vuogZc66cGQxLZgm4mRH78R',
    amount: '76500000',
    nft: '2f5skYFjnx7Na815gQsnp8cfDaMv2jqaDeATALhA9uuK',
  },
  {
    // https://explorer.solana.com/tx/GWqYLJgJxmhK9jb1zKm9wSKp4sSLv25UK5u1QxxVfy33CmFjSfzmoeWzvXdf66igfMMAjNzWkno5bUdhTewk1wG?cluster=devnet
    name: 'buyback cnft-core — devnet',
    expectedStandard: 'cnft-core',
    scope: Network.Devnet,
    wire: 'Ag1hCb54cc5KBhXIVkTQGGDhds1l0FFbG75xpuik7ENJG3Y8xz1Ig1DvgebMUzxdXJBL4qLmhJzqB/x75iE8AwOwEDrxIBzDvN4sSA6nmGt/pXaTdo3fRh5mrT0BEtGBaopqMzvWNrELlnhHdVW5zW2EWwB0q3ukv0tFxTyLbSgFAgERF4akCFBHeIP62Wfd1yRpn2NSJu3WGlYaXwdBjxcDWn9/TSP3UbPRAsNkSm0xxBxWJDUEVJVCXuhHVo/TezuUPIh+mQJLp7gDUKag+VNcJaz8jSRtciuCZXeeOUAkW50sXn8tHLsqlhPPfHMQftnlm7Jct1DLzZ9vIrwXjN+kV1iapl/Q0iVbKV89vOYT5NNNwe5f6h3CnjLY2+jkPEYFSjYEu76vWtYfgXOhH6j4FGtaeHCYAfhT3nTJVwkxxYolGwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPzTX8WDnhJHLUtI/zxY+zK1TjbVJRTR+SRUh70H+i+GMlyWPTiSJ8bs9ECkUjg2DC1oTmdr/EIQEjnvY2+n4WZiLgOt5NShpsiR0X1ndv4omWMoT3GiBISY1HK4HwaWlnJIqBOFObrrUvVHBeRKO2m90gFqNveqMOrybSuuru36menUWmPC/Ph4afvoUT0Yn2iGwiwK1pyrmSs/3hEwe9QMGRm/lIRcy/+ytunLDm+e8jOW7xfcSayxDmzpAAAAAwDWBf6rQXj9ljOaGgMfRFWM3qYQMV80Lc88KeymrQJDpKDlVCWX/1NZKyq9G1F33MY5bT1fJDEh9YGJdgpuDe/oIxgmpKE1IjG/qKKJDf+PiKvN9zTY78pIjlzISSOdF9Xiz0njdbV8hGUxtNfTR7RdhfHj/pc5g1f+D1IrCxH0LbgFTI0klxAfxgVZ2/NMs9aSPbosWmTdWJLvNXhRyywVKU1qZKSEGTSTocWDaOHx8NbXdvJK7geQfqEBBBUSNBU6uw4U8BYHTgvG+aqBjsao9ODDiFRwWrhwCF1T7gL4LeVmKD68osPvSJWMjM0FL0DqrJA9wMtHeR1egrF3GBgbd9uHXZaGT2cvhRs7reawctIXtX1s3kTqM9YV+/wCpDijV1YG69HjJBvMeCfbvcpeevreERPsKkebalQ9G7rPrYIWEJ2ccwA38xD5WIlGreyVqYj6hSJ03ab3/EJeI9QYMAAUCkNADAAkRBQABAQETBAsUEQYPChANFgeXAXcoBuvq3fgxWN0WNnbz3nFihy5AvT3UTOF6pGblNs6dMWB1Bn/g6M2kxkY9rq2rMMpwxgBwzTFNSsxpUy08d9A81tN5HJFhZsXSRgGG9yM8kn59stzHA8DlALZTyoInO3v62ARdhaRwAcXSRgGG9yM8kn59stzHA8DlALZTyoInO3v62ARdhaRwAQDdAAAAAAAAAN0AAAAMAAkDIE4AAAAAAAAIBgACAQ4GFQEBFQQDDgIACgygf4gCAAAAAAYSAC9jYy1mZmUzMzM2OS0zMzk4LTRkZDYtYTM0NS00MTc4NzM3Zjg0MDM6YnV5YmFjaw==',
    user: '6C8CgF1aGHRconBnqrXp4QrinccvK71Ehk5scbiyJnLX',
    amount: '42500000',
    nft: '7bGr6GxLVhoNGiRaGp1zVxwf1SfR8VWXqHeRSYkv1ka9',
  },
] as const;

function signHistoricalTransaction(
  signer: PackPartnerSigner,
  account: ExtendedKeyringAccount,
  unsignedUserWire: string,
  example: (typeof examples)[number],
): ReturnType<PackPartnerSigner['signBuy']> {
  return example.nft
    ? signer.signBuyback(
        account,
        unsignedUserWire,
        {
          amount: example.amount,
          assetAddress: example.nft,
          expectedStandard: example.expectedStandard,
        },
        example.scope,
      )
    : signer.signBuy(
        account,
        unsignedUserWire,
        { amount: example.amount },
        example.scope,
      );
}

describe('Pack Partner historical transactions', () => {
  it.each(examples)(
    'accepts the authentic presignature and instruction schema for $name',
    async (example) => {
      const { wire, user, scope } = example;
      const getMultipleAccounts = vi.fn(() => {
        throw new Error('REACHED_SNAPSHOT');
      });
      const connection = {
        getRpc: () => ({ getMultipleAccounts }),
      } as unknown as SolanaConnection;
      const account = {
        address: user,
        scopes: [scope],
      } as unknown as ExtendedKeyringAccount;
      const signer = new PackPartnerSigner(connection);
      const historical = getTransactionDecoder().decode(
        getBase64Encoder().encode(wire),
      );
      const unsignedUserWire = fromTransactionToBase64String({
        ...historical,
        signatures: { ...historical.signatures, [user]: undefined },
      });
      const signing = signHistoricalTransaction(
        signer,
        account,
        unsignedUserWire,
        example,
      );
      await expect(signing).rejects.toThrow('REACHED_SNAPSHOT');
      expect(getMultipleAccounts).toHaveBeenCalledTimes(1);
    },
  );
});
