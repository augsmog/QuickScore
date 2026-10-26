/**
 * @jest-environment jsdom
 */
const { render } = require('@testing-library/react-native');
const React = require('react');

// Mock the feature flags module
let mockCrossDeviceSharingEnabled = false;

jest.mock('../src/config/features', () => ({
  CROSS_DEVICE_SHARING_ENABLED: mockCrossDeviceSharingEnabled,
  COURSE_SEARCH_ENABLED: false,
}));

// Mock necessary dependencies
jest.mock('../src/services/live-share', () => ({
  createLiveLink: jest.fn(),
  revokeLiveLinks: jest.fn(),
  publishSnapshot: jest.fn(),
}));

jest.mock('../src/services/guest-join', () => ({
  generateJoinCode: jest.fn(() => 'ABC123'),
}));

jest.mock('../src/stores/contest-store', () => ({
  useContestStore: jest.fn(() => ({
    contests: [],
    updateContest: jest.fn(),
  })),
}));

jest.mock('../src/ui/LiveChat', () => ({
  HostChat: () => null,
}));

jest.mock('../src/ui/LocalJoinLimitationBanner', () => ({
  LocalJoinLimitationBanner: () => null,
}));

jest.mock('../src/services/local-join-limitation', () => ({
  getLocalJoinLimitation: () => ({ title: 'Test', message: 'Test message' }),
}));

const mockContest = {
  id: 'test-id',
  name: 'Test Contest',
  joinCode: 'ABC123',
  liveShareEnabled: false,
  course: { name: 'Test Course', par: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4] },
  groups: [],
  games: [],
  status: 'active',
  betUnit: 5,
  hasTeams: false,
  createdAt: new Date().toISOString(),
};

describe('Feature flag UI hiding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the mock to disabled state
    mockCrossDeviceSharingEnabled = false;
    jest.resetModules();
  });

  test('ContestJoinCode renders nothing when CROSS_DEVICE_SHARING_ENABLED is false', () => {
    // Re-require after setting flag to false
    const { ContestJoinCode } = require('../src/ui/ContestJoinCode');
    const { queryByText } = render(React.createElement(ContestJoinCode, { contest: mockContest }));

    // These strings should NOT appear
    expect(queryByText(/join code/i)).toBeNull();
    expect(queryByText(/ABC123/)).toBeNull();
    expect(queryByText(/same browser/i)).toBeNull();
    expect(queryByText(/copy.*invite/i)).toBeNull();
    expect(queryByText(/share.*invite/i)).toBeNull();
  });

  test('LiveShare renders nothing when CROSS_DEVICE_SHARING_ENABLED is false', () => {
    const { LiveShare } = require('../src/ui/LiveShare');
    const { queryByText } = render(React.createElement(LiveShare, { contest: mockContest }));

    // These strings should NOT appear
    expect(queryByText(/share live scoreboard/i)).toBeNull();
    expect(queryByText(/revoke live links/i)).toBeNull();
    expect(queryByText(/live link/i)).toBeNull();
  });

  test('ContestJoinCode renders content when CROSS_DEVICE_SHARING_ENABLED is true', () => {
    // Temporarily enable the flag
    mockCrossDeviceSharingEnabled = true;
    jest.resetModules();
    
    const { ContestJoinCode } = require('../src/ui/ContestJoinCode');
    const { getByText } = render(React.createElement(ContestJoinCode, { contest: mockContest }));

    // Join code should appear
    expect(getByText(/ABC123/)).toBeTruthy();
  });

  test('LiveShare renders content when CROSS_DEVICE_SHARING_ENABLED is true', () => {
    // Temporarily enable the flag
    mockCrossDeviceSharingEnabled = true;
    jest.resetModules();
    
    const { LiveShare } = require('../src/ui/LiveShare');
    const { getByText } = render(React.createElement(LiveShare, { contest: mockContest }));

    // Share button should appear
    expect(getByText(/share live scoreboard/i)).toBeTruthy();
  });
});
