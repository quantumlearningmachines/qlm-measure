# Verifying verify.html

The page footer shows a 64-character hex hash. To verify it:

1. Read the hash from the footer (or from the `<span id="ph">` element).
2. Replace that hash in the file with this exact placeholder:
   ```
   PAGE_HASH_PLACEHOLDER_64CHARS_PADDING_XXXXXXXXXXXXXXXXXXXXXXXXXX
   ```
3. Compute SHA-256 of the modified file.
4. The result must equal the hash you read in step 1.

```bash
H=$(grep -oP 'id="ph">\K[a-f0-9]{64}' verify.html)
sed "s/$H/PAGE_HASH_PLACEHOLDER_64CHARS_PADDING_XXXXXXXXXXXXXXXXXXXXXXXXXX/" verify.html | shasum -a 256
# Output should start with $H
```

The release also includes `SHA256SUMS` with the file's raw SHA-256, which is a different value (it includes the hash in the footer). Both are valid verification paths.
