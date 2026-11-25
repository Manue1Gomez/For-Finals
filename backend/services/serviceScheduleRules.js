const AppError = require('./appError');

function isModelingWorkshop(service) {
  return /modeling workshop/i.test(service.name);
}

function getScheduleDetails(services) {
  const workshopServices = services.filter(isModelingWorkshop);
  if (workshopServices.length > 0 && services.length > 1) {
    const message = 'Modeling Workshop cannot be combined with any other service.';
    throw new AppError(message, 409, { serviceIds: message });
  }

  if (workshopServices.length > 0) {
    return { durationHours: null, isWorkshop: true };
  }

  return {
    durationHours: services.reduce((total, service) => total + Number(service.durationHours), 0),
    isWorkshop: false,
  };
}

module.exports = { isModelingWorkshop, getScheduleDetails };
