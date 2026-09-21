# Wubi86 search dictionary

`wubi86-single.tsv` is a generated, reduced projection of the Rime Wubi86 dictionary version 0.7.
It retains only the first Wubi letter for each single Han character because RHN stores compact Wubi
initial codes rather than full input-method phrases.

Source: https://github.com/rime/rime-wubi/blob/master/wubi86.dict.yaml

License: GNU Lesser General Public License v3.0. The unmodified license text is stored in
`THIRD_PARTY_LICENSE_wubi86.txt`.

Regenerate the resource with `backend/scripts/update-wubi86-search-dictionary.sh`.
