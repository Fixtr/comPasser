const startDateValue = '2026-04-26';
const duration = 2;
const parts = startDateValue.split('-');
const startDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);

const selectedDates = [];
for (let i = 0; i < duration; i++) {
  const nextDate = new Date(startDate.getTime());
  nextDate.setDate(nextDate.getDate() + i);
  
  const year = nextDate.getFullYear();
  const month = String(nextDate.getMonth() + 1).padStart(2, '0');
  const day = String(nextDate.getDate()).padStart(2, '0');
  selectedDates.push(`${year}-${month}-${day}`);
}
console.log("Selected Dates:", selectedDates);
