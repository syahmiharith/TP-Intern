import {expect,test} from "@playwright/test";
import {gotoHome,uploadReceipt,mockExtractionResponse,lowConfidenceExtraction,expandCurrentReceipt,fillReviewFields} from "./support/receipt";
test("invalid required data blocks export and corrected data is immediately eligible",async({page})=>{
 await mockExtractionResponse(page,lowConfidenceExtraction);await gotoHome(page);await uploadReceipt(page);await page.getByRole("button",{name:"Extract",exact:true}).click();
 await expect(page.getByText("Needs attention",{exact:true})).toBeVisible();await expandCurrentReceipt(page);
 await expect(page.getByText("Merchant name is required.")).toBeVisible();await fillReviewFields(page);
 await expect(page.getByRole("button",{name:"Export",exact:true})).toBeEnabled();
 await expect(page.getByRole("button",{name:"Mark reviewed",exact:true})).toHaveCount(0);
});
test("ambiguous currency and signed receipt totals need correction without any review gate",async({page})=>{
 await mockExtractionResponse(page,lowConfidenceExtraction);await gotoHome(page);await uploadReceipt(page);await page.getByRole("button",{name:"Extract",exact:true}).click();await expandCurrentReceipt(page);await fillReviewFields(page);
 await page.getByLabel("Total Amount",{exact:true}).fill("-1");await page.getByLabel("Currency",{exact:true}).fill("$");
 await expect(page.getByText("Choose a recognized currency code.")).toBeVisible();await expect(page.getByRole("button",{name:"Export",exact:true})).toBeDisabled();
 await page.getByLabel("Currency",{exact:true}).fill("JPY");await page.getByLabel("Currency",{exact:true}).press("Enter");await page.getByLabel("Total Amount",{exact:true}).fill("10.50");
 await expect(page.getByText("Too many decimal places for this currency.")).toBeVisible();await page.getByLabel("Total Amount",{exact:true}).fill("10");
 await expect(page.getByRole("button",{name:"Export",exact:true})).toBeEnabled();
});
