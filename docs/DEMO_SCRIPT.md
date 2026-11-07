# Receipt-to-Form demonstration

Open https://receipt-to-form-syahmiharith.vercel.app.

1. Point out upload as the main action and the optional sample button. Live extraction sends images to an external AI service; provider and storage details are in the footer.
2. Choose **Try samples**. Both receipts appear in the existing queue. The stationery image shows USD 28.00 while its initial extraction says 23.00.
3. Compare the stationery image with its form and correct the total to 28.00.
4. Use **Save changes**, then **Mark reviewed**, within that receipt card. Original low model confidence stays visible independently.
5. Change the reviewed total again. The card shows unsaved changes and the batch CSV export is blocked for that receipt.
6. Refresh, verify the pending correction returns, then use **Discard changes** to restore the saved reviewed 28.00 revision.
7. Use the batch toolbar's single **Export expenses CSV** action. Open the file and check total, receipt ID, source filename and review timestamp. Secondary **Export JSON** includes original extraction and reviewed values.
8. Optionally upload a synthetic receipt into the same queue and extract it. Explain visible retry/stop controls if the provider is unavailable.
9. On a narrow screen, switch between form and image and use the same card actions. Preview supports keyboard focus, Escape, zoom and rotation.

Saved receipts are local to this address/device and expire seven days after editing. The legacy address retains existing saved receipts for recovery; finish and export there before clearing and continuing to the branded app. No participant outcomes are claimed by this demonstration.
