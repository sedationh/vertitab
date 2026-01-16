# Release Guide

## Automated Release Process

### 📦 System Components

1. **release.sh** - Automated release script
2. **.github/workflows/release.yml** - GitHub Actions workflow
3. **manifest.json** - Version number management

### 🚀 Usage

#### Creating a New Release

1. Ensure all changes are committed

   ```bash
   git status  # Check for uncommitted changes
   ```

2. Run the release script

   ```bash
   ./release.sh
   ```

3. Select version type when prompted:
   - `1` - Patch (1.0.7 → 1.0.8) - Bug fixes
   - `2` - Minor (1.0.7 → 1.1.0) - New features
   - `3` - Major (1.0.7 → 2.0.0) - Breaking changes
   - `4` - Custom - Enter version manually

4. Confirm version number. The script will automatically:
   - ✅ Update version in manifest.json
   - ✅ Create git commit
   - ✅ Create git tag (format: v1.0.8)
   - ✅ Ask if you want to push to remote

5. After confirming push, GitHub Actions will automatically:
   - 📦 Create zip package (only essential extension files)
   - 🏷️ Create GitHub Release
   - ⬆️ Upload zip file as Release asset

### 📥 User Downloads

Users can:

1. Visit the project's Releases page
2. Download the latest `vertitab-enhanced-vX.X.X.zip`
3. Extract and load directly into Chrome
4. No need to clone the entire repository

### 🔧 Manual Release (If Needed)

If you prefer not to use the script:

```bash
# 1. Manually update version in manifest.json

# 2. Commit changes
git add manifest.json
git commit -m "chore: bump version to v1.0.8"

# 3. Create tag
git tag -a v1.0.8 -m "Release v1.0.8"

# 4. Push
git push origin main
git push origin v1.0.8
```

### 📋 Version Numbering

Follows [Semantic Versioning](https://semver.org/):

- **Major (X.0.0)**: Incompatible API changes
- **Minor (0.X.0)**: Backward-compatible new features
- **Patch (0.0.X)**: Backward-compatible bug fixes

### 🎯 Workflow Diagram

```
Development Complete
    ↓
Run ./release.sh
    ↓
Select Version Type
    ↓
Auto-update manifest.json
    ↓
Create commit + tag
    ↓
Push to GitHub
    ↓
Trigger GitHub Actions
    ↓
Generate zip + Create Release
    ↓
Users Can Download
```

### ⚠️ Important Notes

1. **Pre-push Check**: Ensure all code has been tested
2. **Version Number**: Follow semantic versioning
3. **Tag Format**: Must be `v1.0.8` format (v + version number)
4. **First Use**: Enable Actions in GitHub repository settings

### 🔍 Check Release Status

- **Actions**: `https://github.com/YOUR_USERNAME/YOUR_REPO/actions`
- **Releases**: `https://github.com/YOUR_USERNAME/YOUR_REPO/releases`

### 🐛 Troubleshooting

**Issue: Actions not triggered**

- Check tag format is correct (v1.0.8)
- Check .github/workflows/release.yml file exists
- Check if Actions are enabled in repo Settings → Actions

**Issue: Release creation failed**

- Check GitHub Token permissions
- Check if tag/release with same name already exists

**Issue: Zip file incomplete**

- Check exclude list in release.yml
- Ensure all required files are committed
