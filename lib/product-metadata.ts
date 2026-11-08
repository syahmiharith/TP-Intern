export const productUrl = "https://receipt-to-form-syahmiharith.vercel.app";
export const productTitle = "Receipt-to-Form | Receipt to CSV & JSON";
export const productDescription = "Turn receipt images and ZIPs into editable expenses and line items. Correct details, resume saved work, and export CSV or JSON. No account needed.";
export const productStructuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "@id": `${productUrl}/#app`,
  name: "Receipt-to-Form",
  url: productUrl,
  description: productDescription,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web browser",
  featureList: ["Receipt image and ZIP import", "Editable expenses and line items", "Browser-saved corrections", "Failed receipt retries", "CSV and JSON export"],
  author: {
    "@type": "Person",
    name: "Zulsyahmi Zulkefli",
    url: "https://portfolio-syahmiharith.vercel.app"
  },
  sameAs: "https://github.com/syahmiharith/receipt-to-form"
};
