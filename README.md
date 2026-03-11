# Interval Timer

An Electron-based interval timer application for Linux.

## Building

```bash
npm install
npm run dist
```

The AppImage will be created in the `release/` directory.

## Releases

### Creating a GitHub Release

1. Build the AppImage:
   ```bash
   npm run dist
   ```

2. Go to your GitHub repository → Releases → Create a new release

3. Upload the AppImage file from `release/Interval Timer-1.0.0.AppImage`

4. Users can download and run it directly by:
   - Making it executable (if needed): `chmod +x "Interval Timer-1.0.0.AppImage"`
   - Double-clicking the file, or running: `./Interval\ Timer-1.0.0.AppImage`

### Running the AppImage

The AppImage is fully portable and doesn't require installation. Simply:
1. Download the `.AppImage` file
2. Make it executable (if not already): `chmod +x *.AppImage`
3. Double-click to run or execute from terminal

The AppImage works on most Linux distributions without any dependencies.
