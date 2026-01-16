#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Vertical Tabs Enhanced - Release Script ===${NC}\n"

# Check if we're in a git repository
if [ ! -d .git ]; then
    echo -e "${RED}Error: Not a git repository${NC}"
    exit 1
fi

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo -e "${YELLOW}Warning: You have uncommitted changes${NC}"
    echo -e "Please commit or stash your changes first."
    exit 1
fi

# Get current version from manifest.json
CURRENT_VERSION=$(grep -o '"version": "[^"]*' manifest.json | cut -d'"' -f4)
echo -e "Current version: ${YELLOW}v${CURRENT_VERSION}${NC}\n"

# Ask for version type
echo "Select version bump type:"
echo "  1) Patch (x.x.X) - Bug fixes"
echo "  2) Minor (x.X.x) - New features"
echo "  3) Major (X.x.x) - Breaking changes"
echo "  4) Custom - Enter manually"
echo ""
read -p "Enter choice [1-4]: " choice

# Parse current version
IFS='.' read -r -a version_parts <<< "$CURRENT_VERSION"
major="${version_parts[0]}"
minor="${version_parts[1]}"
patch="${version_parts[2]}"

case $choice in
    1)
        patch=$((patch + 1))
        ;;
    2)
        minor=$((minor + 1))
        patch=0
        ;;
    3)
        major=$((major + 1))
        minor=0
        patch=0
        ;;
    4)
        read -p "Enter new version (e.g., 1.2.3): " NEW_VERSION
        ;;
    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac

if [ -z "$NEW_VERSION" ]; then
    NEW_VERSION="${major}.${minor}.${patch}"
fi

echo -e "\nNew version will be: ${GREEN}v${NEW_VERSION}${NC}"
read -p "Continue? [y/N]: " confirm

if [[ ! $confirm =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

# Update version in manifest.json
echo -e "\n${YELLOW}Updating manifest.json...${NC}"
sed -i.bak "s/\"version\": \".*\"/\"version\": \"${NEW_VERSION}\"/" manifest.json
rm manifest.json.bak

# Git operations
echo -e "${YELLOW}Creating git commit and tag...${NC}"
git add manifest.json
git commit -m "chore: bump version to v${NEW_VERSION}"

# Create annotated tag
git tag -a "v${NEW_VERSION}" -m "Release v${NEW_VERSION}

Version: v${NEW_VERSION}
Date: $(date +%Y-%m-%d)

Enhanced features:
- Group close button functionality
- Top search bar as default position
- Auto-focus search input on activation
- Fully documented and readable code

Original extension by Guo Kai (https://guokai.dev/)"

echo -e "\n${GREEN}✓ Version bumped to v${NEW_VERSION}${NC}"
echo -e "${GREEN}✓ Commit created${NC}"
echo -e "${GREEN}✓ Tag created${NC}\n"

# Show what will be pushed
echo -e "${YELLOW}The following will be pushed:${NC}"
git log --oneline -1
echo ""
git tag --list "v${NEW_VERSION}" -n9
echo ""

read -p "Push to remote? This will trigger the release workflow. [y/N]: " push_confirm

if [[ $push_confirm =~ ^[Yy]$ ]]; then
    echo -e "\n${YELLOW}Pushing to remote...${NC}"
    git push origin main
    git push origin "v${NEW_VERSION}"
    
    echo -e "\n${GREEN}=== Release Complete! ===${NC}"
    echo -e "GitHub Actions will now:"
    echo -e "  1. Create a release for v${NEW_VERSION}"
    echo -e "  2. Generate a zip file"
    echo -e "  3. Upload it as a release asset"
    echo -e "\nCheck: https://github.com/YOUR_USERNAME/YOUR_REPO/actions"
else
    echo -e "\n${YELLOW}Not pushed. You can push later with:${NC}"
    echo -e "  git push origin main"
    echo -e "  git push origin v${NEW_VERSION}"
fi
