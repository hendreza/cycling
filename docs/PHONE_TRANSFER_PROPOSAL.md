# Computer → Android QR transfer

Status: implemented after the owner’s instruction to continue following the disclosure of local-network coordinate exposure. The listener stays closed until “Create phone link” is clicked. Development verification uses loopback and temporary data only; the owner’s Wi-Fi and Android camera/import flow still need a device check.

The user flow is: select a route → open “Send to phone over Wi-Fi” → choose “Create phone link” → scan the QR with Android → download the prepared OsmAnd GPX → open in OsmAnd and choose Navigation. The phone and computer must share the same trusted local network; the computer stays running during the transfer.

The implemented scope is:

- Open a separate GPX-only listener on a selected local IPv4 interface only after the user clicks the transfer button. Keep the planner, database controls and API bound to loopback.
- Serve one selected route with the chosen lap count and moving speed. Do not serve filesystem paths, a route list, access notes, records or administrator functions.
- Use an unpredictable 192-bit token, generated locally. Generate the QR locally, with no QR provider, upload, cloud service or automatic outbound message.
- Expire the link and close the listener after 10 minutes. Also offer “Close link now”; replacing the transfer, changing access blocks, deleting records or stopping the app revokes the active transfer.
- Recheck routing policy and saved access blocks before preparing the file. Changing the selection must visibly invalidate an older QR before displaying a replacement.
- Store the temporary file in memory. Disable request logs, caching, embedding and external resources on the phone page. Deletion cannot remove a file already downloaded onto another device.
- Show the limitation before opening the listener: local HTTP is unencrypted, and anyone on the network who obtains or observes the token can download the precise route until it expires. Use only trusted Wi-Fi. Router client isolation/firewalls can prevent transfer; do not automatically weaken either.

This does not publish the app on the internet, open router/firewall rules, upload to a cloud service or send messages. The native Linux app supports this transfer. Docker Compose disables it because its unpublished container interfaces/ports cannot provide a usable phone link; use `make dev` for Wi-Fi transfer.

The implemented fallback is a prepared Android download plus the operating system’s file share sheet where supported. The user chooses the destination app. Browsers can refuse GPX file sharing; the download remains available. Web Share requires a supported secure context and user interaction: [MDN Web Share API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API). Android import still follows [OsmAnd’s GPX navigation flow](https://osmand.net/docs/user/navigation/setup/gpx-navigation/).
