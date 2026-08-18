#!/usr/bin/env python3
"""Stamp the verify page hash into its own footer.

The page contains a placeholder or stale hash in <span id="ph">...</span>.
This script:
  1. Replaces the current 64-char hex hash with a fixed placeholder.
  2. SHA-256s the result.
  3. Writes the hash back into the file.
  4. Verifies the README round-trip procedure reproduces it.

Run as part of the build before every deploy. Fails loudly on mismatch.
"""
import hashlib
import re
import sys

PAGE = "verify/index.html"
PLACEHOLDER = "PAGE_HASH_PLACEHOLDER_64CHARS_PADDING_XXXXXXXXXXXXXXXXXXXXXXXXXX"
HASH_RE = re.compile(r'(id="ph">)([a-f0-9]{64}|' + re.escape(PLACEHOLDER) + r')(</span>)')


def main():
    with open(PAGE, "r") as f:
        html = f.read()

    # Step 1: Replace current hash with placeholder
    m = HASH_RE.search(html)
    if not m:
        print(f"FAIL: no page hash span found in {PAGE}")
        sys.exit(1)

    blanked = HASH_RE.sub(r"\g<1>" + PLACEHOLDER + r"\g<3>", html)

    # Step 2: Compute hash of blanked content
    page_hash = hashlib.sha256(blanked.encode("utf-8")).hexdigest()

    # Step 3: Write hash back
    stamped = blanked.replace(PLACEHOLDER, page_hash)
    with open(PAGE, "w") as f:
        f.write(stamped)

    # Step 4: Verify round-trip
    with open(PAGE, "rb") as f:
        final_content = f.read()

    # Re-extract and re-blank to verify
    verify_blanked = final_content.decode().replace(page_hash, PLACEHOLDER)
    verify_hash = hashlib.sha256(verify_blanked.encode("utf-8")).hexdigest()

    if verify_hash != page_hash:
        print(f"FAIL: round-trip verification failed")
        print(f"  stamped:  {page_hash}")
        print(f"  verified: {verify_hash}")
        sys.exit(1)

    # Also update SHA256SUMS with the raw file hash
    raw_hash = hashlib.sha256(final_content).hexdigest()
    with open("SHA256SUMS", "w") as f:
        f.write(f"{raw_hash}  verify/index.html\n")

    print(f"OK: page hash = {page_hash}")
    print(f"    raw hash  = {raw_hash}")
    print(f"    SHA256SUMS updated")


if __name__ == "__main__":
    main()
