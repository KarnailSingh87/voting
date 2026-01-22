import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import axios from '../../../utils/axios';
import Login from '../Login';
import { vi, describe, beforeEach, test, expect } from 'vitest';

// ensure axios.post can be spied/mocked
axios.post = axios.post || vi.fn();

describe('Login flow', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('performs aadhaar lookup and requests OTP automatically', async () => {
    axios.post = vi.fn((url, body) => {
      if (url === '/api/aadhaar-lookup') {
        return Promise.resolve({ data: { success: true, name: 'Test User', mock: true } });
      }
      if (url === '/api/voter/request-otp') {
        return Promise.resolve({ data: { message: 'OTP sent' } });
      }
      return Promise.reject(new Error('unknown'));
    });

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );
    const aadhaarInput = screen.getByPlaceholderText('12-digit Aadhaar');
    await userEvent.type(aadhaarInput, '123412341234');

    await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/aadhaar-lookup', { aadhaar: '123412341234' }));
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/voter/request-otp', expect.any(Object)));

    // name should be shown
    expect(screen.getByText(/Detected name:/)).toBeInTheDocument();
  });
});
