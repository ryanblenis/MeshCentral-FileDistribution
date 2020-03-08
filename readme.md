# MeshCentral-FileDistribution

Sample plugin for the [MeshCentral2](https://github.com/Ylianst/MeshCentral) Project.

## Installation

 Pre-requisite: First, make sure you have plugins enabled for your MeshCentral installation:
>     "plugins": {
>          "enabled": true
>     },
Restart your MeshCentral server after making this change.

 To install, simply add the plugin configuration URL when prompted:
 `https://raw.githubusercontent.com/ryanblenis/MeshCentral-FileDistribution/master/config.json`

## Features
- Distribute files from the "My Files" tab to your endpoints.

## Usage Notes
- Files are distributed from the server to the chosen path(s) on each chosen endpoint.
- The endpoints check their distributed files every 20 minutes. If the file is missing or not the correct size, the file is requested form the server.
- The server checks the files that are used in the "My Files" section every 20 minutes. If the files have changed, the clients are pushed new files.
- File checks are currently based on size, lacking a good file hashing method in the MeshAgent. This also speeds the checking process, but is less than optimal in ensuring the file is an exact copy.