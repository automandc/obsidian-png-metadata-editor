# Releasing

How a version of the plugin gets from this repository to people's vaults.

Obsidian doesn't build plugins itself. When someone installs or updates the plugin, Obsidian reads `manifest.json` on the default branch to learn the latest version, then downloads `main.js`, `manifest.json` and `styles.css` from the GitHub release whose tag is exactly that version (for example `0.1.0`, with no leading `v`). `versions.json` tells older Obsidian versions which plugin version they can still use.

The **Release Obsidian plugin** workflow (`.github/workflows/release.yml`) does the building. Pushing a tag starts it: it checks the tag matches `manifest.json`, builds the plugin and creates a **draft** release with the three files attached. A person then reviews the draft and publishes it.

## First release and community submission (one time)

1. **Make the repository public.** On GitHub, open **Settings → General**, scroll to **Danger Zone**, select **Change visibility** and choose **Public**. Anyone can then read, fork and open issues or pull requests. Only people you add as collaborators can push.
2. **Release `0.1.0`** by following [Every release](#every-release) below, skipping step 1 because `0.1.0` is already the version in `manifest.json`.
3. **Submit to the community directory.**
    1. Go to [community.obsidian.md](https://community.obsidian.md) and sign in with your Obsidian account (create a free one if you don't have one).
    2. Link your GitHub account when asked. This proves you own the repository.
    3. Select **Add your plugin** and pick this repository.
    4. Review is automatic. If it reports errors, fix them, bump the version and publish a new release. Once it passes, the plugin appears under **Settings → Community plugins → Browse** in Obsidian.

## Every release

1. **Bump the version** on an up-to-date `main`:

    ```bash
    git checkout main && git pull
    npm version patch   # 0.1.0 → 0.1.1; use minor or major for bigger changes
    ```

    This updates `package.json`, `manifest.json` and `versions.json`, commits them and creates a matching tag (the repository's `.npmrc` keeps the tag free of a `v`). If you raise `minAppVersion` in `manifest.json`, do it before this step.

2. **Push the commit and the tag:**

    ```bash
    git push origin main
    git push origin 0.1.1   # the new version
    ```

    If `main` only accepts changes through pull requests, merge a pull request that bumps the version first, then create and push just the tag: `git tag 0.1.1 && git push origin 0.1.1`.

3. **Wait for the workflow.** In the **Actions** tab, **Release Obsidian plugin** should finish green. If it fails on "Check tag matches manifest version", the tag and `manifest.json` disagree: delete the tag (`git push --delete origin 0.1.1` and `git tag -d 0.1.1`), fix the version and try again.
4. **Publish the draft.** Open **Releases**, select the new draft, check it has `main.js`, `manifest.json` and `styles.css` attached, edit the notes if you like, and select **Publish release**.

Obsidian users get the update within a few hours. Don't create the release from GitHub's **Draft a new release** page: that creates the tag too, and the workflow then fails because the release already exists.
