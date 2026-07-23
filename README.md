## hello world

## Invoice Management

### Usage

#### Classify a single invoice
```bash
npm run invoice:cli -- "https://osher.pairzon.com/1247/..."
```

This will:
- Fetch invoice data from the URL
- Prompt you to classify each item by usage category
- Save the CSV file to `/mnt/c/Users/Yehez/Downloads/invoices/YYYY-MM/invoice_YYYY-MM-DD_HHMM_uuid.csv`

#### Calculate monthly summary
```bash
npm run invoice:month -- [YYYY-MM]
npm run invoice:month -- 2025-12
```

If no month is provided, you'll see an interactive menu to select a month.

This will:
- Aggregate all invoices for the selected month
- Calculate totals per usage category (his, apartment, flatmate, friends, unknown)
- Display a summary table in the console
- Save a `summary_YYYY-MM.csv` file in the month folder

### Storage Structure

Invoices are stored in monthly folders under Windows Downloads (WSL2 path):
```
/mnt/c/Users/Yehez/Downloads/invoices/
├── 2025-12/
│   ├── invoice_2025-12-31_1715_uuid.csv
│   ├── invoice_2025-12-30_1430_uuid.csv
│   └── summary_2025-12.csv
├── 2025-01/
│   └── ...
```

### Migrating Existing Invoices

If you have existing invoice CSV files in the `./invoices` folder in the project directory, you can migrate them to the new Downloads structure:

1. For each CSV file, extract the date from the filename (format: `invoice_YYYY-MM-DD_HHMM_uuid.csv`)
2. Create the corresponding month folder: `/mnt/c/Users/Yehez/Downloads/invoices/YYYY-MM/`
3. Move the CSV file to that folder

Example:
```bash
# File: ./invoices/invoice_2025-12-31_1715_uuid.csv
# Move to: /mnt/c/Users/Yehez/Downloads/invoices/2025-12/invoice_2025-12-31_1715_uuid.csv
```

The CLI will still search the legacy `./invoices` folder as a fallback, but new invoices will only be saved to the Downloads structure.